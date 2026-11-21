import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KeptGrants, type SrtWinResult } from "./kept-grants.ts";
import type { Machine } from "./machine.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

/** Windows with the sandbox set up, where a removal answers `removed` and this process has `admin` rights or not; `order` logs the install. */
function windows(
  admin = false,
  removed: "removed" | "grants_kept" = "removed",
  order: string[] = [],
): Machine {
  return {
    ...linux,
    platform: "win32",
    windowsSandboxState: async () => "ok",
    installWindowsSandbox: async () => {
      order.push("install");
      return "installed";
    },
    uninstallWindowsSandbox: async () => removed,
    elevated: async () => admin,
  } as Machine;
}

/** srt's `user status` answer: whether its sandbox account exists, and the state of the kept grants. */
function userStatus(exists: boolean, grants: "none" | "present" | "unknown"): string {
  return JSON.stringify({ user: { exists }, persistent_grants: { state: grants, roots: [] } });
}

/** Grants on a fake `srt-win` that records what it was asked into `calls` and answers from `answer`. */
function fakeGrants(
  answer: (args: string[]) => Partial<SrtWinResult> = () => ({}),
  calls: string[][] = [],
) {
  const grants = new KeptGrants(
    async (args) => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "", ...answer(args) };
    },
    () => "0.0.82",
  );
  return { calls, grants };
}

/** srt's status after a removal with administrator rights: kept grants, no sandbox account. */
const orphaned = (args: string[]) =>
  args[0] === "user" ? { stdout: userStatus(false, "present") } : {};

const forgotAll = (calls: string[][]) =>
  calls.some((call) => call.join(" ") === "profile forget") &&
  calls.some((call) => call.join(" ") === "acl forget --all");

verifies("sandbox-srt.removal-kept-access", () => {
  describe("a removal with administrator rights", () => {
    /** The removal's result when srt's status after it is `status`. */
    function removal(status: string) {
      const { grants } = fakeGrants((args) => (args[0] === "user" ? { stdout: status } : {}));
      return new SrtSandbox(windows(true, "grants_kept"), undefined, null, {
        grants,
        warn: () => {},
      }).remove();
    }

    it("says the kept access goes at the next start when srt lists kept grants and no account", async () => {
      expect(await removal(userStatus(false, "present"))).toEqual({
        ok: true,
        keptAccess: "until_next_start",
      });
    });

    it("is done without keptAccess when srt still lists its sandbox account", async () => {
      expect(await removal(userStatus(true, "present"))).toEqual({ ok: true });
    });
  });
});

verifies("sandbox-srt.forget-after-admin-removal", () => {
  describe("a removal with administrator rights", () => {
    it("takes nothing back itself, and says the next start takes the grants back when it will see them", async () => {
      const warnings: string[] = [];
      const { calls, grants } = fakeGrants(orphaned);
      const sandbox = new SrtSandbox(windows(true, "grants_kept"), undefined, null, {
        grants,
        warn: (message) => warnings.push(message),
      });
      expect(await sandbox.remove()).toEqual({ ok: true, keptAccess: "until_next_start" });
      expect(forgotAll(calls)).toBe(false);
      expect(warnings.join()).toMatch(/next time it starts .*srt-win acl forget --all/);
    });

    it("says to remove it again when the next start won't see the grants", async () => {
      const warnings: string[] = [];
      const { grants } = fakeGrants((args) =>
        args[0] === "user" ? { stdout: userStatus(true, "present") } : {},
      );
      const sandbox = new SrtSandbox(windows(true, "grants_kept"), undefined, null, {
        grants,
        warn: (message) => warnings.push(message),
      });
      await sandbox.remove();
      expect(warnings.join()).toMatch(/Remove it again without them/);
    });
  });

  describe("taking the grants back at the next start", () => {
    let base: string;
    beforeEach(async () => {
      base = await mkdtemp(join(tmpdir(), "srt-orphaned-start-"));
    });
    afterEach(async () => {
      await rm(base, { recursive: true, force: true });
    });

    /** The lock holder's sandbox on `machine`, with a sweep root. */
    function holder(machine: Machine, grants: KeptGrants, warnings: string[] = []): SrtSandbox {
      return new SrtSandbox(machine, fakeRunner().runner, null, {
        grants,
        sweepRoots: [join(base, "runs")],
        takeBackOrphaned: true,
        warn: (message) => warnings.push(message),
      });
    }

    it("takes back every kept grant before the sweep when srt lists them and its account is gone", async () => {
      const { calls, grants } = fakeGrants(orphaned);
      const warnings: string[] = [];
      await holder(windows(), grants, warnings).sweepOnce();
      expect(forgotAll(calls)).toBe(true);
      const forgetAt = calls.findIndex((call) => call.join(" ") === "acl forget --all");
      const sweepAt = calls.findLastIndex((call) => call[0] === "user");
      expect(forgetAt).toBeLessThan(sweepAt);
      expect(warnings.join()).toMatch(/Took back/);
    });

    it("logs why when taking them back fails, and sessions still open", async () => {
      const { grants } = fakeGrants((args) =>
        args[0] === "acl" && args[2] === "--all"
          ? { status: 1, stderr: "a session runs" }
          : orphaned(args),
      );
      const warnings: string[] = [];
      const sandbox = holder(windows(), grants, warnings);
      await sandbox.sweepOnce();
      expect(warnings.join()).toMatch(/next start.*a session runs/);
      await (await sandbox.open(makeProfile(base))).close();
    });

    it("takes nothing back in a host with administrator rights, and says so", async () => {
      const { calls, grants } = fakeGrants(orphaned);
      const warnings: string[] = [];
      await holder(windows(true), grants, warnings).sweepOnce();
      expect(forgotAll(calls)).toBe(false);
      expect(warnings.join()).toMatch(/administrator rights too/);
    });

    it("counts a machine that can't say whether it is elevated as elevated", async () => {
      const { calls, grants } = fakeGrants(orphaned);
      const { elevated: _, ...unsure } = windows();
      await holder(unsure as Machine, grants).sweepOnce();
      expect(forgotAll(calls)).toBe(false);
    });

    it("forgets nothing beyond the sweep while the sandbox account is there", async () => {
      const { calls, grants } = fakeGrants((args) =>
        args[0] === "user" ? { stdout: userStatus(true, "present") } : {},
      );
      await holder(windows(), grants).sweepOnce();
      expect(forgotAll(calls)).toBe(false);
    });

    it("forgets nothing when srt's status can't be read", async () => {
      const { calls, grants } = fakeGrants((args) =>
        args[0] === "user" ? { stdout: "not json" } : {},
      );
      await holder(windows(), grants).sweepOnce();
      expect(forgotAll(calls)).toBe(false);
    });

    it("takes nothing back in a host that doesn't hold the lock", async () => {
      const { calls, grants } = fakeGrants(orphaned);
      const sandbox = new SrtSandbox(windows(), fakeRunner().runner, null, { grants });
      await (await sandbox.open(makeProfile(base))).close();
      expect(forgotAll(calls)).toBe(false);
    });

    it("does nothing on Linux", async () => {
      const { calls, grants } = fakeGrants(orphaned);
      await holder(linux as Machine, grants).sweepOnce();
      expect(calls).toEqual([]);
    });
  });

  describe("taking the grants back before a new setup", () => {
    it("takes them back in this process before the install", async () => {
      const order: string[] = [];
      const calls: string[][] = [];
      const { grants } = fakeGrants((args) => {
        if (args.join(" ") === "acl forget --all") order.push("forget");
        return orphaned(args);
      }, calls);
      const sandbox = new SrtSandbox(windows(false, "removed", order), undefined, null, {
        grants,
        warn: () => undefined,
      });
      await sandbox.setUp();
      expect(forgotAll(calls)).toBe(true);
      expect(order).toEqual(["forget", "install"]);
    });

    it("still sets up when taking them back fails, and logs why", async () => {
      const order: string[] = [];
      const { grants } = fakeGrants((args) =>
        args[0] === "acl" && args[2] === "--all" ? { status: 1, stderr: "denied" } : orphaned(args),
      );
      const warnings: string[] = [];
      const sandbox = new SrtSandbox(windows(false, "removed", order), undefined, null, {
        grants,
        warn: (message) => warnings.push(message),
      });
      await sandbox.setUp();
      expect(order).toEqual(["install"]);
      expect(warnings.join()).toMatch(/denied/);
    });
  });
});
