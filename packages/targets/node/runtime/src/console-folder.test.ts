import { chmod, lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ConsoleListening,
  consoleSocketPath,
  listenOnConsoleSocket,
} from "./console-socket.ts";

let folder: string;
let listening: ConsoleListening | undefined;

beforeEach(async () => {
  // A short base keeps the socket's path within the system's limit on every runner.
  folder = await mkdtemp(join(tmpdir(), "cf-"));
});

afterEach(async () => {
  await listening?.close();
  listening = undefined;
  await chmod(folder, 0o700);
  await rm(folder, { recursive: true, force: true });
});

/** Opens the console socket of a profile at `profile`, for the user `uid` (this one by default). */
async function openIn(profile: string, uid?: number): Promise<ConsoleListening> {
  listening = await listenOnConsoleSocket({
    path: consoleSocketPath(profile, "0123456789abcdef"),
    answer: async () => ({ ok: true }),
    logError: () => undefined,
    ...(uid === undefined ? {} : { uid }),
  });
  return listening;
}

/** A profile folder at `relative` in the test's folder, made with `mode`. */
async function profileWithMode(relative: string, mode: number): Promise<string> {
  const profile = join(folder, relative);
  await mkdir(profile, { recursive: true });
  await chmod(profile, mode);
  return profile;
}

const otherUser = (process.getuid?.() ?? 0) + 1;

// This package's tests run on Linux and macOS only, like the `serve` that opens the socket.
describe("console folder", () => {
  verifies("runtime.console-socket", () => {
    it("refuses a console folder that belongs to someone else", async () => {
      await expect(openIn(folder, otherUser)).rejects.toMatchObject({
        reason: "folder-not-private",
      });
    });

    it("refuses a folder above the console's that others may write to, and names it", async () => {
      const profile = await profileWithMode("profile", 0o775);

      await expect(openIn(profile)).rejects.toMatchObject({
        reason: "parent-not-private",
        folder: profile,
      });
      await expect(lstat(join(profile, "console", "0123456789abcdef.sock"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("allows a sticky folder anyone may write to, like /tmp, over a folder of its own at 0700", async () => {
      const shared = await profileWithMode("shared", 0o1777);
      const profile = await profileWithMode("shared/own", 0o700);

      const { path } = await openIn(profile);
      expect(path.startsWith(shared)).toBe(true);
    });

    it("refuses a sticky folder anyone may write to over a folder others may open", async () => {
      const shared = await profileWithMode("shared", 0o1777);
      const profile = await profileWithMode("shared/open", 0o755);

      await expect(openIn(profile)).rejects.toMatchObject({
        reason: "parent-not-private",
        folder: shared,
      });
    });
  });
});
