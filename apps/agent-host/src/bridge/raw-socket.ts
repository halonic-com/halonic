import { connect } from "node:net";

/**
 * Writes `raw` bytes to the port, as any local program can, and resolves with
 * everything sent back once the connection closes (or after `waitMs`).
 */
export function rawExchange(port: number, raw: string | Buffer, waitMs = 2_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(port, "127.0.0.1", () => socket.write(raw));
    const timer = setTimeout(() => socket.destroy(), waitMs);
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

export function statusOf(answer: string): number {
  return Number(answer.split(" ")[1]);
}

export function rawPost(port: number, path: string, headers: string[], body: string): string {
  return [
    `POST ${path} HTTP/1.1`,
    `Host: 127.0.0.1:${port}`,
    "Content-Type: application/json",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "Connection: close",
    ...headers,
    "",
    body,
  ].join("\r\n");
}
