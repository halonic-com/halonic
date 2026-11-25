import { chmod } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { dirname, join } from "node:path";
import {
  ConsoleSocketError,
  expectOwn,
  makeOwnFolder,
  removeLeftoverSocket,
} from "./console-folder.ts";
import { readOneLine } from "./console-line.ts";

export { ConsoleSocketError } from "./console-folder.ts";

/**
 * The console channel of `halonic serve` (`server.device-pairing`, Julian on HAL-18561): a Unix
 * socket that only the user who runs the server can open, so `halonic serve pair` and `halonic
 * serve devices` reach the running server without HTTP. The socket is 0600 in the profile's
 * `console` folder, which is 0700, both made under a umask of 077 before the bind, so neither is ever open to
 * anyone else, even for a moment. The folder is the guard on every Unix: macOS ignores a
 * socket's own mode, but nobody else can reach a socket in a folder they can't enter.
 */

/** The sockets' folder in the profile folder. */
const folderName = "console";

/** How many characters of the workspace's key name its socket: 64 bits, short enough for any profile. */
const keyCharacters = 16;

/**
 * The longest socket path in bytes that binds everywhere: Linux takes 107, macOS 103. A longer
 * one would be cut short by the system, so it is refused instead.
 */
const maxPathBytes = 103;

/** The most bytes one request may have; every request is a few short fields. */
const maxRequestBytes = 4096;

/** A connection that sends no whole request in this long is closed. */
const idleMs = 10_000;

/** The most connections open at once; one person at a terminal needs one. */
const maxConnections = 8;

/**
 * Where the console socket of a workspace is: in one `console` folder of the profile, named by
 * the start of the workspace's key. Not in the workspace's own folder, whose path is too long
 * for a socket under macOS's Application Support.
 */
export function consoleSocketPath(profileRoot: string, workspaceKey: string): string {
  return join(profileRoot, folderName, `${workspaceKey.slice(0, keyCharacters)}.sock`);
}

/** Refuses a place the socket can't safely be at, before anything is made there. */
export function checkConsolePlace(path: string, platform = process.platform): void {
  if (platform === "win32") throw new ConsoleSocketError("windows", path);
  if (Buffer.byteLength(path) > maxPathBytes) throw new ConsoleSocketError("path-too-long", path);
}

/** What {@link listenOnConsoleSocket} needs. */
export interface ConsoleSocketOptions {
  /** The socket's path, from {@link consoleSocketPath}; its folder is made for it. */
  readonly path: string;
  /** Answers one request, as it came off the socket. */
  readonly answer: (request: unknown) => Promise<unknown>;
  /** Where the cause of a failed request goes; the caller only sees the connection close. */
  readonly logError: (error: unknown) => void;
  /**
   * The user the socket and its folders must belong to; this process's by default. Tests give
   * another, to stand for folders someone else owns.
   */
  readonly uid?: number;
}

/** An open console socket. */
export interface ConsoleListening {
  readonly path: string;
  /** Stops listening, ends open connections and removes the socket. */
  close(): Promise<void>;
}

/**
 * Opens the console socket. One connection carries one request, a JSON line, and gets one JSON
 * line back. Only one `serve` holds a workspace's engine at a time, so a socket left in the
 * folder is from a `serve` that ended without removing it; it is removed only when it is a
 * socket of this user's.
 *
 * @throws ConsoleSocketError when the system has no Unix sockets, the path is too long, the
 *   folder isn't this user's alone, or something other than this user's socket is in its place
 */
export async function listenOnConsoleSocket(
  options: ConsoleSocketOptions,
): Promise<ConsoleListening> {
  const { path } = options;
  checkConsolePlace(path);
  const uid = options.uid ?? process.getuid?.() ?? -1;
  const connections = new Set<Socket>();
  const server = createServer((socket) => {
    if (!peerIsAllowed(socket)) {
      socket.destroy();
      return;
    }
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
    answerConnection(socket, options).catch((error: unknown) => {
      options.logError(error);
      socket.destroy();
    });
  });
  server.maxConnections = maxConnections;
  const umask = process.umask(0o077);
  try {
    await makeOwnFolder(dirname(path), path, uid);
    await removeLeftoverSocket(path, uid);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(path, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } finally {
    process.umask(umask);
  }
  const close = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      for (const socket of connections) socket.destroy();
    });
    await removeLeftoverSocket(path, uid).catch(() => undefined);
  };
  try {
    await chmod(path, 0o600);
    await expectOwn(path, "socket", 0o600, uid);
  } catch (error) {
    await close();
    throw error;
  }
  return { path, close };
}

/**
 * Whether the user at the other end of a connection may use the console. Node can't read a
 * connection's user id (`SO_PEERCRED`, `getpeereid`) without native code, so every connection
 * passes here and the folder is the guard (Julian, HAL-18620: option 3). A native check, should
 * it ever be wanted, goes in this one place.
 */
function peerIsAllowed(_socket: Socket): boolean {
  return true;
}

/** Reads one request, answers it, and closes the connection. */
async function answerConnection(socket: Socket, options: ConsoleSocketOptions): Promise<void> {
  socket.setTimeout(idleMs, () => socket.destroy());
  const line = await readOneLine(socket, maxRequestBytes);
  if (line === null) {
    socket.destroy();
    return;
  }
  let request: unknown;
  try {
    request = JSON.parse(line);
  } catch {
    request = null;
  }
  const reply = await options.answer(request);
  socket.end(`${JSON.stringify(reply)}\n`);
}
