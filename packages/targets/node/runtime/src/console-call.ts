import { createConnection } from "node:net";
import { readOneLine } from "./console-line.ts";
import { checkConsolePlace } from "./console-socket.ts";

/** The most bytes a reply may have: a list of devices, never a file. */
const maxReplyBytes = 1024 * 1024;

/** A reply that doesn't come in this long counts as none; the server stops waiting as long. */
const replyMs = 10_000;

/** No `halonic serve` listens on the console socket: none runs for the workspace, or it ended. */
export class ConsoleNotRunningError extends Error {
  constructor(message = "No halonic serve is running for this workspace.") {
    super(message);
    this.name = "ConsoleNotRunningError";
  }
}

/**
 * Something took the connection and the request, but no whole reply came: it closed, or answered
 * too late. A `serve` may still be carrying the request out, so a caller that asked it to start
 * something can't tell whether it did. A {@link ConsoleNotRunningError} for every caller that
 * only needs to know no answer came.
 */
export class ConsoleNoReplyError extends ConsoleNotRunningError {
  constructor() {
    super("halonic serve took the request but didn't answer in time.");
    this.name = "ConsoleNoReplyError";
  }
}

/**
 * Sends one request to the console socket at `path` and gives the server's reply, parsed.
 *
 * @throws ConsoleSocketError when the system has no Unix sockets or the path is too long
 * @throws ConsoleNotRunningError when nothing listens there, or its reply isn't JSON
 * @throws ConsoleNoReplyError when it took the request but closed, or didn't reply within 10
 *   seconds, without a whole reply
 */
export async function callConsoleSocket(path: string, request: unknown): Promise<unknown> {
  checkConsolePlace(path);
  const socket = createConnection(path);
  // A plain timer, not the socket's own idle timer, so the wait is one the tests can move on.
  const timer = setTimeout(() => socket.destroy(), replyMs);
  try {
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
        // The timer may close it before it connects, which gives no error.
        socket.once("close", reject);
      });
    } catch {
      throw new ConsoleNotRunningError();
    }
    socket.write(`${JSON.stringify(request)}\n`);
    const line = await readOneLine(socket, maxReplyBytes);
    if (line === null) throw new ConsoleNoReplyError();
    return parsedReply(line);
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
}

/** The reply as JSON; text that isn't comes from no `halonic serve`, or one that broke off. */
function parsedReply(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    throw new ConsoleNotRunningError();
  }
}
