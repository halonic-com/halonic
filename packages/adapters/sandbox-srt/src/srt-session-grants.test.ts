import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KeptGrants, type SrtWinResult } from "./kept-grants.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

const windows = { ...linux, platform: "win32" as const, hasWindowsSandbox: async () => true };

/** Grants on a fake `srt-win` that records what it was asked and answers from `answer`. */
function fakeGrants(
  answer: (args: string[]) => Partial<SrtWinResult> = () => ({}),
  version = "0.0.81",
) {
  const calls: string[][] = [];
  const grants = new KeptGrants(
    async (args) => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "", ...answer(args) };
    },
    () => version,
  );
  return { calls, grants };
}

verifies("sandbox-srt.kept-grants", () => {
  describe("SrtSession on Windows", () => {
    let base: string;
    beforeEach(async () => {
      base = await mkdtemp(join(tmpdir(), "srt-grants-"));
    });
    afterEach(async () => {
      await rm(base, { recursive: true, force: true });
    });

    const forgotten = (calls: string[][]) =>
      calls.filter((call) => call[1] === "forget").map((call) => call[2]);

    it("forgets the working and the temp folder when it closes", async () => {
      const { calls, grants } = fakeGrants();
      const profile = makeProfile(base);
      const session = await new SrtSandbox(windows, fakeRunner().runner, null, { grants }).open(
        profile,
      );
      expect(forgotten(calls)).toEqual([]);
      await session.close();
      expect(forgotten(calls)).toEqual([profile.workingFolder, profile.tempFolder]);
    });

    it("forgets them when the time limit runs out", async () => {
      const { calls, grants } = fakeGrants();
      const profile = makeProfile(base, { timeLimitMs: 20 });
      const session = await new SrtSandbox(windows, fakeRunner().runner, null, { grants }).open(
        profile,
      );
      await expect.poll(() => forgotten(calls).length).toBe(2);
      await session.close();
    });

    it("forgets them when the signal aborts", async () => {
      const { calls, grants } = fakeGrants();
      const controller = new AbortController();
      const session = await new SrtSandbox(windows, fakeRunner().runner, null, { grants }).open(
        makeProfile(base),
        { signal: controller.signal },
      );
      controller.abort();
      await expect.poll(() => forgotten(calls).length).toBe(2);
      await session.close();
    });

    it("rejects close(), naming the folder and the reason, when forgetting fails", async () => {
      const { grants } = fakeGrants((args) =>
        args[1] === "forget" ? { status: 1, stderr: "denied" } : {},
      );
      const profile = makeProfile(base);
      const session = await new SrtSandbox(windows, fakeRunner().runner, null, { grants }).open(
        profile,
      );
      await expect(session.close()).rejects.toThrow(
        new RegExp(`${profile.workingFolder.replace(/\\/g, "\\\\")}.*exit 1: denied`),
      );
    });

    it("leaves a working folder another open session uses until that one closes too", async () => {
      const { calls, grants } = fakeGrants();
      const sandbox = new SrtSandbox(windows, fakeRunner().runner, null, { grants });
      const first = makeProfile(base);
      const second = { ...first, tempFolder: join(base, "temp-2") };
      const one = await sandbox.open(first);
      const two = await sandbox.open(second);
      await expect(one.close()).resolves.toBeUndefined();
      expect(forgotten(calls)).toEqual([first.tempFolder]);
      await two.close();
      expect(forgotten(calls)).toEqual([first.tempFolder, first.workingFolder, second.tempFolder]);
    });

    it("refuses to open on a version of sandbox-runtime it was not tried with", async () => {
      const { calls, grants } = fakeGrants(() => ({}), "9.9.9");
      const { runner, probes } = fakeRunner();
      await expect(
        new SrtSandbox(windows, runner, null, { grants }).open(makeProfile(base)),
      ).rejects.toThrow(/9\.9\.9 is not tested/);
      expect(probes).toEqual([]);
      expect(calls).toEqual([]);
    });

    it("sweeps the run folder once, on the first open, and logs a failure", async () => {
      const runs = join(base, "runs");
      const { calls, grants } = fakeGrants((args) =>
        args[0] === "user"
          ? {
              stdout: JSON.stringify({ persistent_grants: { roots: [] } }),
              status: 1,
              stderr: "gone",
            }
          : {},
      );
      const warnings: string[] = [];
      const sandbox = new SrtSandbox(windows, fakeRunner().runner, null, {
        runsFolder: runs,
        grants,
        warn: (message) => warnings.push(message),
      });
      await (await sandbox.open(makeProfile(base))).close();
      await (await sandbox.open(makeProfile(base))).close();
      expect(calls.filter((call) => call[0] === "user")).toHaveLength(1);
      expect(warnings.join()).toMatch(/can't be listed/);
    });

    it("never starts srt-win on Linux", async () => {
      const { calls, grants } = fakeGrants();
      const sandbox = new SrtSandbox(linux, fakeRunner().runner, null, {
        runsFolder: base,
        grants,
      });
      await (await sandbox.open(makeProfile(base))).close();
      expect(calls).toEqual([]);
    });
  });
});
