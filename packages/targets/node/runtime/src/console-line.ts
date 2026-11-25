import type { Socket } from "node:net";

/**
 * The first line on `socket`, without its newline, as UTF-8; or `null` when the socket ends
 * before a whole line, or the line is longer than `maxBytes`, so a caller can't make the other
 * side hold an endless line in memory.
 */
export function readOneLine(socket: Socket, maxBytes: number): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let length = 0;
    const finish = (line: string | null): void => {
      socket.off("data", onData);
      socket.off("end", onEnd);
      socket.off("close", onEnd);
      socket.off("error", onEnd);
      resolve(line);
    };
    const onData = (chunk: Buffer): void => {
      const newline = chunk.indexOf(0x0a);
      const taken = newline === -1 ? chunk : chunk.subarray(0, newline);
      chunks.push(taken);
      length += taken.length;
      if (length > maxBytes) finish(null);
      else if (newline !== -1) finish(Buffer.concat(chunks).toString("utf8"));
    };
    const onEnd = (): void => finish(null);
    socket.on("data", onData);
    socket.once("end", onEnd);
    socket.once("close", onEnd);
    socket.once("error", onEnd);
  });
}
