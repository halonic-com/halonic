import { existsSync, statSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLauncherTemp } from "./launcher-temp.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { command, fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, mkdtemp: vi.fn(actual.mkdtemp), writeFile: vi.fn(actual.writeFile) };
});

/** The launcher temp folders made since the test started. */
async function launcherTemps(): Promise<string[]> {
  const made = await Promise.all(vi.mocked(fsPromises.mkdtemp).mock.results.map((r) => r.value));
  return made.filter((folder: string) => folder.includes("hsrt-"));
}

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "srt-session-test-"));
  vi.mocked(fsPromises.mkdtemp).mockClear();
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const profile = (overrides: Partial<SandboxProfile> = {}) => makeProfile(base, overrides);

/** The longest name srt gives a socket in the launcher's temp folder: `srt-mux-<pid>-<n>.sock`. */
const longestSocketName = `srt-mux-${"9".repeat(10)}-${"z".repeat(4)}.sock`;

/** What macOS allows for a socket path, the shortest limit of the platforms srt runs on. */
const macSocketPathLimit = 104;

/** Windows makes no launcher temp folder (see the last test), so there the tests check just that. */
const onWindows = process.platform === "win32";
const expectNoneOnWindows = async () => expect(await makeLauncherTemp()).toBeNull();

verifies("sandbox-srt.session", () => {
  describe("the launcher's own temp folder", () => {
    it("is short enough for srt's sockets whatever the session's temp folder, and private", async () => {
      if (onWindows) return expectNoneOnWindows();
      const folder = await makeLauncherTemp();
      expect(folder).not.toBeNull();
      const path = folder ?? "";
      try {
        expect(Buffer.byteLength(join(path, longestSocketName))).toBeLessThan(macSocketPathLimit);
        expect(statSync(path).mode & 0o777).toBe(0o700);
      } finally {
        await rm(path, { recursive: true, force: true });
      }
    });

    it("is what the launcher of the probe and of every program gets, until the session closes", async () => {
      if (onWindows) return expectNoneOnWindows();
      const { runner, runs, probes } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      await session.start(command);
      const folders = new Set(
        [...probes, ...runs.map((run) => run.request)].map(
          (request) => request.launcherEnv["TMPDIR"],
        ),
      );
      expect(folders.size).toBe(1);
      const [folder = ""] = folders;
      expect(existsSync(folder)).toBe(true);
      await session.close();
      expect(existsSync(folder)).toBe(false);
    });

    it("is removed when the session fails to open", async () => {
      if (onWindows) return expectNoneOnWindows();
      vi.mocked(fsPromises.writeFile).mockRejectedValueOnce(new Error("disk full"));
      const { runner } = fakeRunner();
      await expect(new SrtSandbox(linux, runner).open(profile())).rejects.toThrow(/disk full/);
      const made = await launcherTemps();
      expect(made).toHaveLength(1);
      expect(made.filter((folder) => existsSync(folder))).toEqual([]);
    });
  });

  it("is none on Windows, where srt uses a loopback port", async () => {
    expect(await makeLauncherTemp("win32")).toBeNull();
  });
});
