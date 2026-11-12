import { createServer, type Server } from "node:net";

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
