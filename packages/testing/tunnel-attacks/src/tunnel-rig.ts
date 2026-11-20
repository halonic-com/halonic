import { connect, createServer, type Socket } from "node:net";
import { type GatewayListener, startGatewayListener } from "@halonicjs/adapter-remote-gateway";
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
  for (let attempt = 0; ; attempt++) {
    const port = await freePort();
    try {
      const gateway = await startGatewayListener({
        source,
        phones,
        pairing: phones,
        policy: { allowRiskyRemotely: () => options.allowRisky === true },
        port,
        ...(options.listTunnelName === false
          ? {}
          : { extraHosts: [`gateway-${port}.fake-tunnel.invalid`] }),
        ...(options.maxConnections === undefined ? {} : { maxConnections: options.maxConnections }),
        ...(options.heartbeatMs === undefined ? {} : { heartbeatMs: options.heartbeatMs }),
        ...(options.helloTimeoutMs === undefined ? {} : { helloTimeoutMs: options.helloTimeoutMs }),
        ...(options.handshakeTimeoutMs === undefined
          ? {}
          : { handshakeTimeoutMs: options.handshakeTimeoutMs }),
      });
      const endpoint = await tunnel.start({ gateway: { host: "127.0.0.1", port: gateway.port } });
      return { gateway, endpoint };
    } catch (error) {
      // Another process took the port between the probe and the listener; try another.
      if (attempt >= 4) throw error;
    }
  }
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
      phone.sendJson({ type: "hello", id: "h1", version: 2 });
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

/** A TCP forwarder on loopback to `port`, which is all a tunnel does to the gateway. */
function openForwarder(port: number): Promise<{ port: number; close: () => Promise<void> }> {
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
