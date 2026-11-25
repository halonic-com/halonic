import { connect, createServer, type Socket } from "node:net";
import {
  type GatewayListener,
  type GatewayListenerOptions,
  type GatewayPairing,
  type GatewayPhones,
  startGatewayListener,
} from "@halonicjs/adapter-remote-gateway";
import type { TunnelEndpoint } from "@halonicjs/ports";
import { FakeTunnelProvider } from "@halonicjs/testing-contracts";
import { RecordingSource } from "./recording-source.ts";
import { RigPhones } from "./rig-phone.ts";
import { WireClient } from "./wire-client.ts";

export interface TunnelRigOptions {
  /** Whether the gateway lists the tunnel's name as a `Host` it accepts. Defaults to `true`, as the host does for a tunnel it started. */
  listTunnelName?: boolean;
  /** Whether the person allowed risky approvals to be answered from a phone. Defaults to `false`. */
  allowRisky?: boolean;
  /** Passed to the listener. */
  maxConnections?: number;
  heartbeatMs?: number;
  helloTimeoutMs?: number;
  handshakeTimeoutMs?: number;
}

/**
 * The remote path as phase A has it: the real gateway listener on a loopback
 * port, a fake tunnel provider that was started for exactly that port, and a
 * forwarder that does what a real tunnel does, which is to take a connection
 * from anywhere and open one to the gateway's loopback port. An attacker talks
 * to the forwarder, so the gateway sees every request come from loopback, as
 * it will behind a real tunnel: only its own checks stand between them.
 */
export interface TunnelRig {
  readonly source: RecordingSource;
  /** The host's key, its paired phones and its pairing service (never open). */
  readonly phones: RigPhones;
  readonly gateway: GatewayListener;
  readonly tunnel: FakeTunnelProvider;
  readonly endpoint: TunnelEndpoint;
  /** The name a phone puts in `Host`: the tunnel endpoint's host. */
  readonly tunnelName: string;
  /** The loopback port of the forwarder, the tunnel's near end. */
  readonly forwarderPort: number;
  /** A client that reaches the gateway through the forwarder. */
  client(): WireClient;
  /** A client that opens the WebSocket, reconnects as a newly paired phone, and says hello inside the session. */
  greeted(): Promise<WireClient>;
  stop(): Promise<void>;
}

/**
 * Starts the gateway on a free port and the tunnel for it. The fake names its endpoint after the
 * gateway's port, so the port is picked first and the tunnel's name listed from it.
 */
async function startGatewayAndTunnel(
  source: RecordingSource,
  phones: RigPhones,
  tunnel: FakeTunnelProvider,
  options: TunnelRigOptions,
): Promise<{ gateway: GatewayListener; endpoint: TunnelEndpoint }> {
  return await withFreePort(async (port) => {
    const gateway = await startRigGateway(port, source, { phones, pairing: phones }, options);
    const endpoint = await tunnel.start({ gateway: { host: "127.0.0.1", port: gateway.port } });
    return { gateway, endpoint };
  });
}

/** Runs `start` on a free loopback port, and on another when a process took that one first. */
export async function withFreePort<T>(start: (port: number) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const port = await freePort();
    try {
      return await start(port);
    } catch (error) {
      // Another process took the port between the probe and the listener; try another.
      if (attempt >= 4) throw error;
    }
  }
}

/** The fake tunnel's name for a gateway on `port`, as `FakeTunnelProvider` gives it. */
export function fakeTunnelName(port: number): string {
  return `gateway-${port}.fake-tunnel.invalid`;
}

/** The real gateway listener on `port`, with `access` as the host's phones and pairing. */
export function startRigGateway(
  port: number,
  source: RecordingSource,
  access: { readonly phones: GatewayPhones; readonly pairing: GatewayPairing },
  options: TunnelRigOptions & { onError?: (error: unknown) => void },
): Promise<GatewayListener> {
  return startGatewayListener({
    source,
    phones: access.phones,
    pairing: access.pairing,
    policy: { allowRiskyRemotely: () => options.allowRisky === true },
    port,
    // The rig's fakes never fail, so a failure is a bug: let it fail the run.
    onError: options.onError ?? rethrow,
    ...(options.listTunnelName === false ? {} : { extraHosts: [fakeTunnelName(port)] }),
    ...listenerLimits(options),
  });
}

function rethrow(error: unknown): never {
  throw error;
}

/** The limits a test set, passed on to the listener; the ones left out keep its defaults. */
function listenerLimits(
  options: TunnelRigOptions,
): Pick<
  GatewayListenerOptions,
  "maxConnections" | "heartbeatMs" | "helloTimeoutMs" | "handshakeTimeoutMs"
> {
  const limits: Record<string, number> = {};
  for (const name of [
    "maxConnections",
    "heartbeatMs",
    "helloTimeoutMs",
    "handshakeTimeoutMs",
  ] as const) {
    const value = options[name];
    if (value !== undefined) limits[name] = value;
  }
  return limits;
}

export async function openTunnelRig(options: TunnelRigOptions = {}): Promise<TunnelRig> {
  const source = new RecordingSource();
  source.addSession("s1");
  source.addApproval("s1", "normal1", "normal");
  source.addApproval("s1", "risky1", "risky");
  const tunnel = new FakeTunnelProvider();
  const phones = new RigPhones();
  const { gateway, endpoint } = await startGatewayAndTunnel(source, phones, tunnel, options);
  const tunnelName = new URL(endpoint.url).host;
  const forwarder = await openForwarder(gateway.port);
  const clients: WireClient[] = [];
  const client = (): WireClient => {
    const opened = new WireClient(forwarder.port);
    clients.push(opened);
    return opened;
  };
  return {
    source,
    phones,
    gateway,
    tunnel,
    endpoint,
    tunnelName,
    forwarderPort: forwarder.port,
    client,
    async greeted() {
      const phone = client();
      await phone.open(forwarder.port, { host: tunnelName });
      await phone.reconnect(phones.pairPhone());
      phone.sendJson({ type: "hello", id: "h1", version: 4 });
      await phone.frames(1);
      return phone;
    },
    async stop() {
      for (const opened of clients) opened.end();
      await forwarder.close();
      await gateway.close();
      await tunnel.stop();
    },
  };
}

/** A free loopback port, found by opening one and closing it. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = address !== null && typeof address === "object" ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * A TCP forwarder on loopback to `port`, which is all a tunnel does to the gateway.
 * `record` gets every chunk that crosses it, either way.
 */
export function openForwarder(
  port: number,
  record: (chunk: Buffer) => void = () => undefined,
): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const sockets = new Set<Socket>();
    const server = createServer((inbound) => {
      const outbound = connect(port, "127.0.0.1");
      for (const socket of [inbound, outbound]) {
        sockets.add(socket);
        socket.on("error", () => undefined);
        socket.on("close", () => {
          sockets.delete(socket);
          inbound.destroy();
          outbound.destroy();
        });
      }
      for (const socket of [inbound, outbound]) socket.on("data", record);
      inbound.pipe(outbound);
      outbound.pipe(inbound);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("The forwarder has no port."));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}
