import { createServer, type Server } from "node:net";
import { networkInterfaces } from "node:os";

/** A listener on a loopback address that the box must not reach, and whether anything reached it. */
export interface LoopbackListener {
  host: string;
  port: number;
  reached(): boolean;
  close(): void;
}

/**
 * Listens on a free port of `host`, for the box to be refused.
 *
 * @returns `null` when this computer can't listen on `host`, such as `::1` without IPv6
 */
export async function listenOnLoopback(
  host: "127.0.0.1" | "::1",
): Promise<LoopbackListener | null> {
  return listenOn(host);
}

/** Listens on a free port of `host`, or returns `null` when this computer can't. */
async function listenOn(host: string): Promise<LoopbackListener | null> {
  let reached = false;
  const server: Server = createServer((socket) => {
    reached = true;
    socket.destroy();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, host, resolve);
    });
  } catch {
    server.close();
    return null;
  }
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    return null;
  }
  return { host, port: address.port, reached: () => reached, close: () => server.close() };
}

/** Listeners the box must not reach: on `127.0.0.1`, and on `::1` where this computer has it. */
export async function listenOnLoopbacks(): Promise<LoopbackListener[]> {
  const v4 = await listenOnLoopback("127.0.0.1");
  if (v4 === null) throw new Error("this computer can't listen on 127.0.0.1");
  const v6 = await listenOnLoopback("::1");
  return v6 === null ? [v4] : [v4, v6];
}

/**
 * Listeners on the other addresses of this computer (its network cards, not
 * loopback), for the box to be refused: the host's own addresses are not the
 * bridge, and a box that reaches them reaches the local network. Link-local
 * IPv6 addresses are left out, which need a scope to be reached.
 */
export async function listenOnHostAddresses(): Promise<LoopbackListener[]> {
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => !entry.internal && !entry.address.startsWith("fe80:"))
    .map((entry) => entry.address);
  const listeners: LoopbackListener[] = [];
  for (const address of new Set(addresses)) {
    const listener = await listenOn(address);
    if (listener !== null) listeners.push(listener);
  }
  return listeners;
}

/** Every listener the box must not reach: loopback, and the host's other addresses. */
export async function listenOnEveryAddress(): Promise<LoopbackListener[]> {
  const loopbacks = await listenOnLoopbacks();
  try {
    return [...loopbacks, ...(await listenOnHostAddresses())];
  } catch (error) {
    for (const listener of loopbacks) listener.close();
    throw error;
  }
}
