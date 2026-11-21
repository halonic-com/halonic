import { randomBytes } from "node:crypto";
import { MemorySecretStore } from "@halonicjs/adapter-memory";
import {
  checkCodeFromBytes,
  decodePairingQr,
  type PairingEvent,
  type PairingSession,
  type PhonePlatform,
  type RemoteControl,
  type RemoteState,
} from "@halonicjs/ports";
import { FakeTunnelProvider, remoteControlContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { sharedHostKey } from "./host-key.ts";
import { HostRemoteControl, type RemoteLanEndpoint } from "./host-remote-control.ts";
import { MemoryFile } from "./memory-file.test-helper.ts";
import { type MulticastSocket, PairAdvert } from "./pair-advert.ts";
import { PairedPhones } from "./paired-phones.ts";
import { PairingDesk } from "./pairing-desk.ts";
import { RemoteSettings } from "./remote-settings.ts";
import { ManualTime, settled } from "./remote-time.test-helper.ts";

const lan = { address: "192.168.1.20", netmask: "255.255.255.0" };

/** A pairing advert on a socket that only records whether it is open. */
function recordedAdvert(time: ManualTime) {
  const sockets: { closed: boolean }[] = [];
  const advert = new PairAdvert({
    open: async () => {
      const socket = { closed: false };
      sockets.push(socket);
      const multicast: MulticastSocket = {
        send: async () => {},
        onMessage: () => {},
        close: async () => {
          socket.closed = true;
        },
      };
      return multicast;
    },
    now: () => time.now().getTime(),
    wait: (ms) => time.wait(ms),
    randomBytes,
    log: () => {},
  });
  return { advert, sockets };
}

interface HostSetup {
  available?: boolean;
  settingsText?: string;
  tunnel?: FakeTunnelProvider;
  withLan?: boolean;
}

/** A host's RemoteControl on the fake tunnel, files in memory and a clock the test moves. */
async function host(setup: HostSetup = {}) {
  const time = new ManualTime();
  const logged: string[] = [];
  const log = (text: string) => logged.push(text);
  const desk = new PairingDesk({ time, randomBytes });
  const phones = await PairedPhones.open({ file: new MemoryFile(), time, log });
  const settingsFile = new MemoryFile(setup.settingsText);
  const settings = await RemoteSettings.open({ file: settingsFile, log });
  const tunnel = setup.tunnel ?? new FakeTunnelProvider();
  const hostKey = sharedHostKey(new MemorySecretStore());
  const advert = recordedAdvert(time);
  const lanEndpoint: RemoteLanEndpoint = { lan, port: 4200, advert: advert.advert };
  const control = await HostRemoteControl.open({
    available: setup.available ?? true,
    hostName: "Test laptop",
    desk,
    phones,
    settings,
    hostKey,
    tunnel,
    gatewayPort: 4100,
    ...(setup.withLan === true ? { lanEndpoint } : {}),
    time,
    log,
  });
  /** Plays the phone and the gateway (B3): message 1, then a message 3 that decrypted. */
  const phoneUsesCode = (code: string, phone: { name: string; platform: PhonePlatform }) => {
    const admission = desk.admit();
    if (!admission.admitted) throw new Error(`message 1 was refused: ${admission.refusal.reason}`);
    expect(admission.ticket.code).toBe(code);
    const checkCode = checkCodeFromBytes(randomBytes(8));
    const use = admission.ticket.useCode({ publicKey: randomBytes(32), ...phone }, checkCode);
    if (!use.used) throw new Error(`the code was refused: ${use.refusal.reason}`);
    return { ticket: admission.ticket, verdict: use.verdict };
  };
  return {
    control,
    time,
    tunnel,
    settingsFile,
    logged,
    hostKey,
    sockets: advert.sockets,
    phoneUsesCode,
  };
}

async function stateOf(control: RemoteControl): Promise<RemoteState> {
  const stream = control.state()[Symbol.asyncIterator]();
  const first = await stream.next();
  await stream.return?.();
  return first.value as RemoteState;
}

async function openPairing(control: RemoteControl) {
  const session: PairingSession = await control.startPairing();
  const stream = session.events()[Symbol.asyncIterator]();
  const next = async (): Promise<PairingEvent> => (await stream.next()).value as PairingEvent;
  return { session, next, first: await next() };
}

const android = { name: "Pixel 8", platform: "android" } as const;

remoteControlContract("the agent host's", async () => {
  const { control, phoneUsesCode } = await host();
  return {
    control,
    phoneUsesCode: async (code, phone) => {
      phoneUsesCode(code, phone);
    },
  };
});

verifies("agent-host.remote-control", () => {
  describe("HostRemoteControl", () => {
    it("puts the host key, the code, the name and the endpoints, LAN first, in the QR code", async () => {
      const { control, hostKey } = await host({ withLan: true });
      const { first } = await openPairing(control);
      if (first.type !== "code") throw new Error(`the pairing began with ${first.type}`);
      expect(decodePairingQr(first.qr)).toEqual({
        hostKey: (await hostKey()).publicKey,
        code: first.code,
        hostName: "Test laptop",
        endpoints: ["tcp://192.168.1.20:4200", "https://gateway-4100.fake-tunnel.invalid"],
      });
    });

    it("ends a code no phone used after 5 minutes, and keeps the pairing open for a new one", async () => {
      const { control, time } = await host();
      const { session, next } = await openPairing(control);
      await time.advance(5 * 60_000);
      expect(await next()).toEqual({ type: "code-ended", reason: "code-expired" });
      expect(await stateOf(control)).toMatchObject({ on: true, pairing: true });
      await session.newCode();
      expect(await next()).toMatchObject({ type: "code" });
    });

    it("tells the dialog and the phone that time ran out when Allow waits 2 minutes, or the phone leaves", async () => {
      const { control, time, phoneUsesCode } = await host();
      const { session, next, first } = await openPairing(control);
      const waited = phoneUsesCode(first.type === "code" ? first.code : "", android);
      await next();
      await time.advance(2 * 60_000);
      expect(await next()).toEqual({ type: "code-ended", reason: "allow-timed-out" });
      expect(await waited.verdict).toEqual({ allowed: false, reason: "timed-out" });
      await session.newCode();
      const fresh = await next();
      const left = phoneUsesCode(fresh.type === "code" ? fresh.code : "", android);
      await next();
      left.ticket.close();
      expect(await next()).toEqual({ type: "code-ended", reason: "allow-timed-out" });
      expect(await left.verdict).toEqual({ allowed: false, reason: "timed-out" });
    });

    it("tells a phone at the check code it was denied when the person ends the code", async () => {
      const { control, phoneUsesCode } = await host();
      const { session, next, first } = await openPairing(control);
      const refused = phoneUsesCode(first.type === "code" ? first.code : "", android);
      await next();
      await session.newCode();
      expect(await refused.verdict).toEqual({ allowed: false, reason: "denied" });
      const fresh = await next();
      const closed = phoneUsesCode(fresh.type === "code" ? fresh.code : "", android);
      await session.close();
      expect(await closed.verdict).toEqual({ allowed: false, reason: "denied" });
    });

    it("tells the phone it is paired once the person allows it", async () => {
      const { control, phoneUsesCode } = await host();
      const { session, next, first } = await openPairing(control);
      const paired = phoneUsesCode(first.type === "code" ? first.code : "", android);
      await next();
      await session.allow();
      expect(await paired.verdict).toEqual({ allowed: true });
      expect(await next()).toMatchObject({ type: "paired", phone: { name: "Pixel 8" } });
    });

    it("ends the pairing when the tunnel goes down, and turns remote off again", async () => {
      const { control, tunnel } = await host();
      const { next } = await openPairing(control);
      tunnel.drop("offline");
      await settled();
      expect(await next()).toEqual({
        type: "ended",
        reason: "tunnel-down",
        tunnelReason: "offline",
      });
      expect(await stateOf(control)).toMatchObject({ on: false, pairing: false });
    });

    it("ends the pairing at once when the tunnel can't start, and says why", async () => {
      const tunnel = new FakeTunnelProvider();
      tunnel.failNextStart("not-installed");
      const { control } = await host({ tunnel });
      const { first } = await openPairing(control);
      expect(first).toEqual({
        type: "ended",
        reason: "tunnel-down",
        tunnelReason: "not-installed",
      });
      expect(await stateOf(control)).toMatchObject({ on: false, pairing: false });
    });

    it("keeps the switches in the profile, and opens the tunnel at start when remote was left on", async () => {
      const { control, settingsFile } = await host();
      await control.setAllowRiskyRemotely(true);
      expect(JSON.parse(settingsFile.text ?? "")).toMatchObject({ allowRiskyRemotely: true });
      const restarted = await host({
        settingsText: '{"version":1,"on":true,"allowRiskyRemotely":true}',
      });
      await settled();
      expect(await stateOf(restarted.control)).toMatchObject({
        on: true,
        allowRiskyRemotely: true,
        tunnel: { state: "ready" },
      });
    });

    it("advertises on the Wi-Fi only while a pairing is open", async () => {
      const { control, sockets } = await host({ withLan: true });
      const { session } = await openPairing(control);
      await settled();
      expect(sockets).toEqual([{ closed: false }]);
      await session.close();
      await settled();
      expect(sockets).toEqual([{ closed: true }]);
    });

    it("refuses remote and pairing while the host doesn't offer remote", async () => {
      const { control } = await host({
        available: false,
        settingsText: '{"version":1,"on":true,"allowRiskyRemotely":false}',
      });
      expect(await stateOf(control)).toMatchObject({
        available: false,
        tunnel: { reason: "stopped" },
      });
      await expect(control.setRemote(true)).rejects.toThrow("doesn't offer remote");
      await expect(control.startPairing()).rejects.toThrow("doesn't offer remote");
    });
  });
});
