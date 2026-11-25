import { chmod, lstat, mkdir, unlink } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { dirname, join } from "node:path";
import { readOneLine } from "./console-line.ts";

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

/**
 * Where the console socket of a workspace is: in one `console` folder of the profile, named by
 * the start of the workspace's key. Not in the workspace's own folder, whose path is too long
 * for a socket under macOS's Application Support.
 */
export function consoleSocketPath(profileRoot: string, workspaceKey: string): string {
  return join(profileRoot, folderName, `${workspaceKey.slice(0, keyCharacters)}.sock`);
}

/** Why the console socket can't be opened or reached here. */
export class ConsoleSocketError extends Error {
  readonly reason: "windows" | "path-too-long" | "folder-not-private" | "not-our-socket";
  /** The socket's path. */
  readonly path: string;

  constructor(reason: ConsoleSocketError["reason"], path: string) {
    super(`The console socket can't be used at ${path} (${reason}).`);
    this.name = "ConsoleSocketError";
    this.reason = reason;
    this.path = path;
  }
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
  const connections = new Set<Socket>();
  const server = createServer((socket) => {
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
    answerConnection(socket, options).catch((error: unknown) => {
      options.logError(error);
      socket.destroy();
    });
  });
  const umask = process.umask(0o077);
  try {
    await makeOwnFolder(dirname(path), path);
    await removeLeftoverSocket(path);
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
    await removeLeftoverSocket(path).catch(() => undefined);
  };
  try {
    await chmod(path, 0o600);
    await expectOwn(path, "socket", 0o600);
  } catch (error) {
    await close();
    throw error;
  }
  return { path, close };
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

/** Makes the socket's folder 0700, or checks the one there is: this user's, a folder, 0700. */
async function makeOwnFolder(folder: string, path: string): Promise<void> {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  // An existing folder isn't made private here: a folder someone else could open may already
  // hold their socket or link, so it is refused, and the person sees why.
  await expectOwn(folder, "folder", 0o700, path);
}

/** Removes a socket of this user's at `path`; refuses anything else there. */
async function removeLeftoverSocket(path: string): Promise<void> {
  const found = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (found === null) return;
  if (!found.isSocket() || found.uid !== process.getuid?.()) {
    throw new ConsoleSocketError("not-our-socket", path);
  }
  await unlink(path);
}

/**
 * Checks that `place` is, without following a link, this user's `kind` with exactly `mode`. The
 * error names the socket's `path`.
 */
async function expectOwn(
  place: string,
  kind: "folder" | "socket",
  mode: number,
  path = place,
): Promise<void> {
  const found = await lstat(place);
  const isKind = kind === "folder" ? found.isDirectory() : found.isSocket();
  if (!isKind || found.uid !== process.getuid?.() || (found.mode & 0o777) !== mode) {
    throw new ConsoleSocketError(kind === "folder" ? "folder-not-private" : "not-our-socket", path);
  }
}
