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

/** Listeners the box must not reach: on `127.0.0.1`, and on `::1` where this computer has it. */
export async function listenOnLoopbacks(): Promise<LoopbackListener[]> {
  const v4 = await listenOnLoopback("127.0.0.1");
  if (v4 === null) throw new Error("this computer can't listen on 127.0.0.1");
  const v6 = await listenOnLoopback("::1");
  return v6 === null ? [v4] : [v4, v6];
}
