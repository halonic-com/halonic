import { createConnection } from "node:net";
import { readOneLine } from "./console-line.ts";
import { checkConsolePlace } from "./console-socket.ts";

/** The most bytes a reply may have: a list of devices, never a file. */
const maxReplyBytes = 1024 * 1024;

/** A reply that doesn't come in this long counts as no server. */
const replyMs = 10_000;

/** No `halonic serve` listens on the console socket: none runs for the workspace, or it ended. */
export class ConsoleNotRunningError extends Error {
  constructor() {
    super("No halonic serve is running for this workspace.");
    this.name = "ConsoleNotRunningError";
  }
}

/**
 * Sends one request to the console socket at `path` and gives the server's reply, parsed.
 *
 * @throws ConsoleSocketError when the system has no Unix sockets or the path is too long
 * @throws ConsoleNotRunningError when nothing listens there, or it closes without a whole reply,
 *   or its reply isn't JSON
 */
export async function callConsoleSocket(path: string, request: unknown): Promise<unknown> {
  checkConsolePlace(path);
  const socket = createConnection(path);
  socket.setTimeout(replyMs, () => socket.destroy());
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
  } catch {
    socket.destroy();
    throw new ConsoleNotRunningError();
  }
  socket.write(`${JSON.stringify(request)}\n`);
  const line = await readOneLine(socket, maxReplyBytes);
  socket.destroy();
  if (line === null) throw new ConsoleNotRunningError();
  try {
    return JSON.parse(line) as unknown;
  } catch {
    // What answered isn't a `halonic serve`, or it broke off; either way no console is there.
    throw new ConsoleNotRunningError();
  }
}
