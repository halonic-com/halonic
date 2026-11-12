import { existsSync, statSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLauncherTemp, removeStaleLauncherTemps } from "./launcher-temp.ts";
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

    it("holds the host's process id in its name", async () => {
      if (onWindows) return expectNoneOnWindows();
      const folder = (await makeLauncherTemp()) ?? "";
      try {
        expect(basename(folder)).toMatch(new RegExp(`^hsrt-${process.pid}-[^-]+$`));
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    });

    // Windows has no user ids and makes no launcher temp folders, so there it removes nothing.
    it("removes the user's launcher temp folders whose host is gone, and nothing else", async () => {
      const root = join(base, "tmp");
      await mkdir(root);
      const deadHost = join(root, "hsrt-41-aaaaaa");
      const liveHost = join(root, "hsrt-42-bbbbbb");
      const notOurs = join(root, "hsrt-cccccc");
      const notAFolder = join(root, "hsrt-41-dddddd");
      await Promise.all([deadHost, liveHost, notOurs].map((folder) => mkdir(folder)));
      await writeFile(join(deadHost, "srt-mux-1-a.sock"), "");
      await writeFile(notAFolder, "");
      await removeStaleLauncherTemps(root, (pid) => pid === 42);
      expect([deadHost, liveHost, notOurs, notAFolder].map((path) => existsSync(path))).toEqual([
        onWindows,
        true,
        true,
        true,
      ]);
    });

    it("never throws, even when the temp root can't be read", async () => {
      await expect(removeStaleLauncherTemps(join(base, "missing"))).resolves.toBeUndefined();
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
