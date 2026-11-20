import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { holdLock } from "@halonicjs/adapter-fs-node";
import { hostLockFile, keptGrantsRecordFolder } from "@halonicjs/adapter-sandbox-srt";
import type { Sandbox, SandboxProfile, SandboxSession } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordingOptions, sweepingUnderHostLock } from "./fenced-sandbox.ts";

/** A sandbox that remembers its sweep roots and how many sessions it opened. */
interface MadeSandbox {
  readonly roots: readonly string[];
  opened: number;
}

/** The sandboxes `sweepingUnderHostLock` made, and the `make` that makes them. */
function sandboxMaker() {
  const made: MadeSandbox[] = [];
  const make = (roots: readonly string[]): Sandbox => {
    const record: MadeSandbox = { roots: [...roots], opened: 0 };
    made.push(record);
    return {
      check: async () => ({ ok: true, reason: null, missing: [] }),
      capabilities: () => {
        throw new Error("Not asked in these tests.");
      },
      open: async () => {
        record.opened += 1;
        return {} as SandboxSession;
      },
    };
  };
  return { made, make };
}

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

const sessionProfile = {} as SandboxProfile;

verifies("cli.sandbox-kept-grants", () => {
  describe("the host lock of the CLI's harness sandbox", () => {
    let profile: ProfileFolder;
    const roots = ["/acme/temp", "/acme/worktrees", "/acme/copies"];
    beforeEach(async () => {
      profile = { platform: "windows", root: await mkdtemp(join(tmpdir(), "cli-host-lock-")) };
    });
    afterEach(async () => {
      await rm(profile.root, { recursive: true, force: true });
    });

    it("on Windows takes the lock at the first session, sweeps only then, and gives it up when released", async () => {
      const { made, make } = sandboxMaker();
      const warnings: string[] = [];
      const sandbox = sweepingUnderHostLock({
        platform: "win32",
        profile,
        sweepRoots: roots,
        make,
        warn: (text) => warnings.push(text),
      });
      expect(await exists(hostLockFile(profile.root))).toBe(false);
      await sandbox.open(sessionProfile);
      await sandbox.open(sessionProfile);
      expect(await exists(hostLockFile(profile.root))).toBe(true);
      expect(made.map((each) => [each.roots, each.opened])).toEqual([
        [[], 0],
        [roots, 2],
      ]);
      await sandbox.release();
      await sandbox.release();
      expect(await exists(hostLockFile(profile.root))).toBe(false);
      expect(warnings).toEqual([]);
    });

    it("on Windows opens its sessions without a sweep while another live process holds the lock, and says why", async () => {
      await mkdir(join(profile.root, "agent-host"));
      const other = await holdLock(hostLockFile(profile.root), {
        onLost: () => {},
        onRenewError: () => {},
      });
      try {
        const { made, make } = sandboxMaker();
        const warnings: string[] = [];
        const sandbox = sweepingUnderHostLock({
          platform: "win32",
          profile,
          sweepRoots: roots,
          make,
          warn: (text) => warnings.push(text),
        });
        await sandbox.open(sessionProfile);
        expect(made.map((each) => [each.roots, each.opened])).toEqual([[[], 1]]);
        expect(warnings.join()).toMatch(/doesn't sweep kept grants: The lock .* is held/);
        await sandbox.release();
        // The other process's lock is still there.
        expect(await exists(hostLockFile(profile.root))).toBe(true);
      } finally {
        await other.release();
      }
    });

    it("never takes the lock when no session opens", async () => {
      const { make } = sandboxMaker();
      const sandbox = sweepingUnderHostLock({
        platform: "win32",
        profile,
        sweepRoots: roots,
        make,
        warn: () => {},
      });
      expect((await sandbox.check()).ok).toBe(true);
      await sandbox.release();
      expect(await exists(join(profile.root, "agent-host"))).toBe(false);
    });

    it("never takes the lock on Linux or macOS, and has no sweep root there", async () => {
      for (const platform of ["linux", "darwin"] as const) {
        const { made, make } = sandboxMaker();
        const sandbox = sweepingUnderHostLock({
          platform,
          profile,
          sweepRoots: roots,
          make,
          warn: () => {},
        });
        await sandbox.open(sessionProfile);
        await sandbox.release();
        expect(made.map((each) => [each.roots, each.opened])).toEqual([[[], 1]]);
      }
      expect(await exists(join(profile.root, "agent-host"))).toBe(false);
    });

    it("records every session's folders in the profile's kept-grant record", () => {
      expect(recordingOptions(profile, [])).toEqual({
        recordFolder: keptGrantsRecordFolder(profile.root),
        sweepRoots: [],
      });
    });
  });
});
