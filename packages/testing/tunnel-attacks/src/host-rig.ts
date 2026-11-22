import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySecretStore } from "@halonicjs/adapter-memory";
import type { GatewayListener } from "@halonicjs/adapter-remote-gateway";
import {
  deskAccess,
  type HostKey,
  HostRemoteControl,
  type MulticastSocket,
  PairAdvert,
  PairedPhones,
  PairingDesk,
  privateFileAt,
  RemoteSettings,
  sharedHostKey,
} from "@halonicjs/app-agent-host/remote-parts";
import { decodePairingQr, type PairingEvent, type PairingSession } from "@halonicjs/ports";
import { FakeTunnelProvider } from "@halonicjs/testing-contracts";
import { ManualTime } from "./manual-time.ts";
import type { ScannedQr } from "./pairing-phone.ts";
import { RecordingSource } from "./recording-source.ts";
import { fakeTunnelName, openForwarder, startRigGateway, withFreePort } from "./tunnel-rig.ts";
import { WireClient } from "./wire-client.ts";

/** The name the rig's computer gives itself in the dialog, the QR code and message 2. */
export const rigHostName = "Rig laptop";

/** One Pair a phone dialog, as Studio drives it, with every event it got so far. */
export interface RigPairing {
  readonly session: PairingSession;
  readonly events: PairingEvent[];
  /** Waits for the `count`th event of `type`, and gives it. */
  event<T extends PairingEvent["type"]>(
    type: T,
    count?: number,
  ): Promise<Extract<PairingEvent, { type: T }>>;
  /** What a phone takes from the QR code shown last. */
  qr(): Promise<ScannedQr>;
}

/**
 * Phase B's remote path with the host's own parts: Studio's RemoteControl
 * with the real pairing desk, the phone store in a real file, the host key,
 * the settings and the mDNS advert (on a socket that records what it sends),
 * in front of the real gateway listener, reached through a forwarder where
 * the fake tunnel stands. The pairing clock is the test's; everything that
 * could carry a secret out is kept: the bytes on the wire, the host's log
 * and the multicast datagrams.
 */
export interface HostRig {
  readonly source: RecordingSource;
  readonly control: HostRemoteControl;
  readonly phones: PairedPhones;
  readonly hostKey: HostKey;
  readonly time: ManualTime;
  readonly gateway: GatewayListener;
  /** The name a phone puts in `Host`: the fake tunnel's, for the gateway's port. */
  readonly tunnelName: string;
  /** The path of the paired phones file. */
  readonly storeFile: string;
  /** Every chunk that crossed the tunnel, either way. */
  readonly wire: Buffer[];
  /** Every line the host logged. */
  readonly logged: string[];
  /** Every datagram the mDNS advert sent. */
  readonly multicast: Uint8Array[];
  /** A client that has opened the WebSocket through the tunnel, before any end-to-end handshake. */
  opened(): Promise<WireClient>;
  /** Opens the Pair a phone dialog: remote turns on and the first code shows. */
  startPairing(): Promise<RigPairing>;
  stop(): Promise<void>;
}

/** An mDNS advert whose socket keeps every datagram it sends. */
function recordingAdvert(time: ManualTime, sent: Uint8Array[], log: (text: string) => void) {
  return new PairAdvert({
    open: async (): Promise<MulticastSocket> => ({
      send: async (message) => {
        sent.push(message);
      },
      onMessage: () => undefined,
      close: async () => undefined,
    }),
    now: () => time.now().getTime(),
    wait: (ms) => time.wait(ms),
    randomBytes,
    log,
  });
}

/** Reads a pairing session's events into a list as they come. */
function watched(session: PairingSession): RigPairing {
  const events: PairingEvent[] = [];
  void (async () => {
    for await (const event of session.events()) events.push(event);
  })();
  const event = async <T extends PairingEvent["type"]>(type: T, count = 1) => {
    for (let turn = 0; turn < 300; turn++) {
      const seen = events.filter((each) => each.type === type);
      if (seen.length >= count) return seen[count - 1] as Extract<PairingEvent, { type: T }>;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`no ${type} event ${count} came; the events were ${JSON.stringify(events)}`);
  };
  const qr = async () => {
    const codes = events.filter((each) => each.type === "code");
    const shown = codes.at(-1) ?? (await event("code"));
    const payload = shown.type === "code" ? decodePairingQr(shown.qr) : undefined;
    if (payload === undefined) throw new Error("the QR code doesn't read");
    return { hostKey: payload.hostKey, code: payload.code };
  };
  return { session, events, event, qr };
}

/** What the host rig keeps of what could carry a secret out, and where the host reports. */
interface Recorders {
  readonly wire: Buffer[];
  readonly logged: string[];
  readonly multicast: Uint8Array[];
  readonly log: (text: string) => void;
}

/**
 * The host's parts with stores in files under `folder` and the pairing desk
 * on `time`, its gateway on a free port, and its RemoteControl on top.
 */
async function openHost(folder: string, time: ManualTime, source: RecordingSource, out: Recorders) {
  const { log } = out;
  const storeFile = join(folder, "remote", "paired-phones.json");
  const phones = await PairedPhones.open({ file: privateFileAt(storeFile), time, log });
  const settingsFile = privateFileAt(join(folder, "remote", "remote.json"));
  const settings = await RemoteSettings.open({ file: settingsFile, log });
  const loadKey = sharedHostKey(new MemorySecretStore());
  const hostKey = await loadKey();
  const desk = new PairingDesk({ time, randomBytes: (length) => randomBytes(length) });
  const access = deskAccess({ desk, phones, hostKey, hostName: rigHostName, log });
  // No onError: the rig's gateway rethrows, so a hostile frame that makes the host fail fails the test.
  const gateway = await withFreePort((port) => startRigGateway(port, source, access, {}));
  const control = await HostRemoteControl.open({
    available: true,
    hostName: rigHostName,
    desk,
    phones,
    settings,
    hostKey: loadKey,
    tunnel: new FakeTunnelProvider(),
    // The rig's gateway listens from start to stop, so the attacks can reach it with remote off too.
    gateway: { start: async () => gateway.port, stop: async () => undefined },
    lanEndpoint: {
      lan: { address: "192.168.1.20", netmask: "255.255.255.0" },
      port: 4200,
      advert: recordingAdvert(time, out.multicast, log),
    },
    time,
    log,
  });
  return { storeFile, phones, hostKey, gateway, control };
}

/** Opens the host rig, with remote off until a test starts a pairing. */
export async function openHostRig(): Promise<HostRig> {
  const folder = await mkdtemp(join(tmpdir(), "tunnel-attacks-"));
  const time = new ManualTime();
  const logged: string[] = [];
  const out: Recorders = { wire: [], logged, multicast: [], log: (text) => logged.push(text) };
  const source = new RecordingSource();
  source.addSession("s1");
  const host = await openHost(folder, time, source, out);
  const { gateway, control } = host;
  const forwarder = await openForwarder(gateway.port, (chunk) => out.wire.push(chunk));
  const tunnelName = fakeTunnelName(gateway.port);
  const clients: WireClient[] = [];
  return {
    ...host,
    source,
    time,
    tunnelName,
    wire: out.wire,
    logged,
    multicast: out.multicast,
    async opened() {
      const client = new WireClient(forwarder.port);
      clients.push(client);
      await client.open(forwarder.port, { host: tunnelName });
      return client;
    },
    async startPairing() {
      const pairing = watched(await control.startPairing());
      await pairing.event("code");
      return pairing;
    },
    async stop() {
      for (const client of clients) client.end();
      await forwarder.close();
      await control.setRemote(false);
      await gateway.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
}
