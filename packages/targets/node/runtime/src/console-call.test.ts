import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleNoReplyError, ConsoleNotRunningError, callConsoleSocket } from "./console-call.ts";

let folder: string;
let server: Server | undefined;
const connections: Socket[] = [];

beforeEach(async () => {
  // A short base keeps the socket's path within the system's limit on every runner.
  folder = await mkdtemp(join(tmpdir(), "cc-"));
});

afterEach(async () => {
  vi.useRealTimers();
  for (const socket of connections.splice(0)) socket.destroy();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
  await rm(folder, { recursive: true, force: true });
});

/**
 * A server that takes each request and calls `onRequest`, which may answer it or leave it, as a
 * `serve` still busy starting a run does.
 */
async function listen(onRequest: (socket: Socket) => void): Promise<string> {
  const path = join(folder, "console.sock");
  server = createServer((socket) => {
    connections.push(socket);
    socket.once("data", () => onRequest(socket));
  });
  await new Promise<void>((resolve) => server?.listen(path, resolve));
  return path;
}

// This package's tests run on Linux and macOS only, like the `serve` that opens the socket.
describe("console call", () => {
  verifies("runtime.console-socket", () => {
    it("fails as taken but unanswered when no reply comes within 10 seconds", async () => {
      let taken: () => void = () => {};
      const requestTaken = new Promise<void>((resolve) => {
        taken = resolve;
      });
      const path = await listen(() => taken());
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      const call = callConsoleSocket(path, { op: "start-run" });
      const failed = expect(call).rejects.toThrow(ConsoleNoReplyError);
      await requestTaken;
      await vi.advanceTimersByTimeAsync(9_999);
      expect(connections[0]?.destroyed).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      await failed;
    });

    it("fails as taken but unanswered when the server closes without a reply", async () => {
      const path = await listen((socket) => socket.end());

      await expect(callConsoleSocket(path, { op: "start-run" })).rejects.toThrow(
        ConsoleNoReplyError,
      );
    });

    it("fails as no server, not as unanswered, when nothing listens", async () => {
      const call = callConsoleSocket(join(folder, "none.sock"), { op: "devices" });

      await expect(call).rejects.toThrow(ConsoleNotRunningError);
      await expect(call).rejects.not.toThrow(ConsoleNoReplyError);
    });
  });
});
