import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createConnection, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConsoleNotRunningError, callConsoleSocket } from "./console-call.ts";
import {
  type ConsoleListening,
  ConsoleSocketError,
  consoleSocketPath,
  listenOnConsoleSocket,
} from "./console-socket.ts";

let folder: string;
let listening: ConsoleListening | undefined;
const failures: unknown[] = [];
const logError = (error: unknown) => failures.push(error);

beforeEach(async () => {
  // A short base keeps the socket's path within the system's limit on every runner.
  folder = await mkdtemp(join(tmpdir(), "cs-"));
  failures.length = 0;
});

afterEach(async () => {
  await listening?.close();
  listening = undefined;
  await rm(folder, { recursive: true, force: true });
});

/** Opens the socket with a console that echoes each request back. */
async function openEcho(): Promise<ConsoleListening> {
  listening = await listenOnConsoleSocket({
    path: socketPath(),
    answer: async (request) => ({ ok: true, echo: request }),
    logError,
  });
  return listening;
}

/** A socket of this user's, left at the console's path by a `serve` that ended. */
async function leaveSocket(): Promise<void> {
  const left = createServer();
  await new Promise<void>((resolve) => left.listen(socketPath(), resolve));
  // Closing a listener removes its socket file, so the server is left open and dropped.
  left.unref();
}

/** The socket of a workspace whose key starts with 0123…, in the test's profile. */
const socketPath = () => consoleSocketPath(folder, "0123456789abcdef0123456789abcdef");

const modeOf = async (path: string) => (await lstat(path)).mode & 0o777;

// This package's tests run on Linux and macOS only, like the `serve` that opens the socket.
describe("console socket", () => {
  verifies("runtime.console-socket", () => {
    it("opens 0600 in a 0700 folder and answers one request per connection", async () => {
      const { path } = await openEcho();

      expect(path).toBe(join(folder, "console", "0123456789abcdef.sock"));
      expect(await modeOf(join(folder, "console"))).toBe(0o700);
      expect(await modeOf(path)).toBe(0o600);
      expect(await callConsoleSocket(path, { op: "devices" })).toEqual({
        ok: true,
        echo: { op: "devices" },
      });
    });

    it("gives the console null for a line that isn't JSON", async () => {
      const { path } = await openEcho();
      const socket = createConnection(path);
      socket.write("not json\n");
      const reply = await new Promise<string>((resolve) => {
        let text = "";
        socket.on("data", (chunk) => {
          text += chunk.toString();
        });
        socket.on("end", () => resolve(text));
      });

      expect(JSON.parse(reply)).toEqual({ ok: true, echo: null });
    });

    it("replaces a socket left by a serve that ended", async () => {
      await mkdir(join(folder, "console"), { mode: 0o700 });
      await leaveSocket();

      const { path } = await openEcho();
      expect(await callConsoleSocket(path, { op: "code" })).toMatchObject({ ok: true });
    });

    it("narrows the process's umask only for the bind, never across an await", async () => {
      const before = process.umask(0o022);
      const seen = new Set<number>();
      let opening = true;
      // Reads the umask on every turn of the event loop while the socket opens, as any other
      // code in the process would see it.
      const watch = (): void => {
        seen.add(process.umask());
        if (opening) setImmediate(watch);
      };
      try {
        watch();
        const { path } = await openEcho();
        opening = false;

        expect(process.umask()).toBe(0o022);
        expect([...seen]).toEqual([0o022]);
        expect(await modeOf(path)).toBe(0o600);
      } finally {
        opening = false;
        process.umask(before);
      }
    });

    it("refuses a plain file at the socket's path and leaves it", async () => {
      await mkdir(join(folder, "console"), { mode: 0o700 });
      await writeFile(socketPath(), "mine");

      await expect(openEcho()).rejects.toThrow(ConsoleSocketError);
      expect(await readFile(socketPath(), "utf8")).toBe("mine");
    });

    it("refuses a link at the socket's path, even to a socket", async () => {
      await mkdir(join(folder, "console"), { mode: 0o700 });
      await symlink(join(folder, "elsewhere.sock"), socketPath());

      await expect(openEcho()).rejects.toMatchObject({ reason: "not-our-socket" });
      expect((await lstat(socketPath())).isSymbolicLink()).toBe(true);
    });

    it("refuses a console folder others may open, and doesn't make it private", async () => {
      await mkdir(join(folder, "console"));
      await chmod(join(folder, "console"), 0o755);

      await expect(openEcho()).rejects.toMatchObject({ reason: "folder-not-private" });
      expect(await modeOf(join(folder, "console"))).toBe(0o755);
    });

    it("refuses a link in place of the console folder", async () => {
      await mkdir(join(folder, "other"), { mode: 0o700 });
      await symlink(join(folder, "other"), join(folder, "console"));

      await expect(openEcho()).rejects.toMatchObject({ reason: "folder-not-private" });
    });

    it("closes a connection whose line is too long, unanswered", async () => {
      const { path } = await openEcho();

      await expect(callConsoleSocket(path, { op: "x".repeat(5000) })).rejects.toThrow(
        ConsoleNotRunningError,
      );
    });

    it("removes the socket when it closes, so a call finds no server", async () => {
      const { path, close } = await openEcho();
      await close();
      listening = undefined;

      await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(callConsoleSocket(path, { op: "devices" })).rejects.toThrow(
        ConsoleNotRunningError,
      );
    });

    it("finds no server when what answers on the socket doesn't reply in JSON", async () => {
      const path = join(folder, "other.sock");
      const connections: Socket[] = [];
      const other = createServer((socket) => {
        connections.push(socket);
        socket.end("hello\n");
      });
      await new Promise<void>((resolve) => other.listen(path, resolve));
      try {
        await expect(callConsoleSocket(path, { op: "devices" })).rejects.toThrow(
          ConsoleNotRunningError,
        );
      } finally {
        await new Promise<void>((resolve) => {
          other.close(() => resolve());
          for (const socket of connections) socket.destroy();
        });
      }
    });

    it("refuses a path longer than the system takes, before it makes anything", async () => {
      const deep = join(folder, "f".repeat(100));
      const path = consoleSocketPath(deep, "0123456789abcdef");
      const opening = listenOnConsoleSocket({ path, answer: async () => null, logError });

      await expect(opening).rejects.toMatchObject({ reason: "path-too-long" });
      await expect(lstat(deep)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });
});
