import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forgetPendingFile, markForgetPending } from "./forget-pending.ts";
import { KeptGrants, type SrtWinResult } from "./kept-grants.ts";
import type { Machine } from "./machine.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

/** Windows with the sandbox set up, where a removal answers `removed` and this process has `admin` rights or not. */
function windows(admin = false, removed: "removed" | "grants_kept" = "removed"): Machine {
  return {
    ...linux,
    platform: "win32",
    windowsSandboxState: async () => "ok",
    uninstallWindowsSandbox: async () => removed,
    elevated: async () => admin,
  } as Machine;
}

/** srt's `user status` answer: whether its sandbox account exists, and the state of the kept grants. */
function userStatus(exists: boolean, grants: "none" | "present" | "unknown"): string {
  return JSON.stringify({ user: { exists }, persistent_grants: { state: grants, roots: [] } });
}

/** Grants on a fake `srt-win` that records what it was asked and answers from `answer`. */
function fakeGrants(answer: (args: string[]) => Partial<SrtWinResult> = () => ({})) {
  const calls: string[][] = [];
  const grants = new KeptGrants(
    async (args) => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "", ...answer(args) };
    },
    () => "0.0.82",
  );
  return { calls, grants };
}

const forgotAll = (calls: string[][]) =>
  calls.some((call) => call.join(" ") === "profile forget") &&
  calls.some((call) => call.join(" ") === "acl forget --all");

verifies("sandbox-srt.forget-after-admin-removal", () => {
  describe("the mark a removal with administrator rights leaves", () => {
    let profile: string;
    let mark: string;
    beforeEach(async () => {
      profile = await mkdtemp(join(tmpdir(), "srt-forget-pending-"));
      await mkdir(join(profile, "agent-host"));
      mark = forgetPendingFile(profile);
    });
    afterEach(async () => {
      await rm(profile, { recursive: true, force: true });
    });

    it("is left by a removal that skipped the user's kept grants, and the log says when they go", async () => {
      const warnings: string[] = [];
      const sandbox = new SrtSandbox(windows(true, "grants_kept"), undefined, null, {
        forgetPendingFile: mark,
        warn: (message) => warnings.push(message),
      });
      expect(await sandbox.remove()).toEqual({ ok: true });
      expect(readFileSync(mark, "utf8")).toBe("");
      expect(warnings.join()).toMatch(/next time it starts/);
    });

    it("isn't left by a removal that took the grants back itself", async () => {
      const sandbox = new SrtSandbox(windows(false, "removed"), undefined, null, {
        forgetPendingFile: mark,
        warn: () => undefined,
      });
      await sandbox.remove();
      expect(existsSync(mark)).toBe(false);
    });

    it("never writes through a file or link already at its place", async () => {
      writeFileSync(mark, "keep");
      expect(markForgetPending(mark)).toBe(true);
      expect(readFileSync(mark, "utf8")).toBe("keep");

      const target = join(profile, "target");
      const linked = join(profile, "agent-host", "linked");
      symlinkSync(target, linked);
      expect(markForgetPending(linked)).toBe(true);
      expect(existsSync(target)).toBe(false);
    });

    it("isn't left where no host ran, and the log says how to take the grants back", async () => {
      const warnings: string[] = [];
      const sandbox = new SrtSandbox(windows(true, "grants_kept"), undefined, null, {
        forgetPendingFile: join(profile, "never", "forget-pending"),
        warn: (message) => warnings.push(message),
      });
      await sandbox.remove();
      expect(existsSync(join(profile, "never"))).toBe(false);
      expect(warnings.join()).toMatch(/Remove it again without them/);
    });
  });

  describe("taking the grants back at the next start", () => {
    let base: string;
    let mark: string;
    beforeEach(async () => {
      base = await mkdtemp(join(tmpdir(), "srt-forget-start-"));
      await mkdir(join(base, "agent-host"));
      mark = forgetPendingFile(base);
    });
    afterEach(async () => {
      await rm(base, { recursive: true, force: true });
    });

    /** The lock holder's sandbox on `machine`, with the mark's place and a sweep root. */
    function holder(machine: Machine, grants: KeptGrants, warnings: string[] = []): SrtSandbox {
      return new SrtSandbox(machine, fakeRunner().runner, null, {
        grants,
        sweepRoots: [join(base, "runs")],
        forgetPendingFile: mark,
        warn: (message) => warnings.push(message),
      });
    }

    it("takes back every kept grant before the sweep when the mark is there, and takes the mark away", async () => {
      writeFileSync(mark, "");
      const { calls, grants } = fakeGrants((args) =>
        args[0] === "user" ? { stdout: userStatus(true, "none") } : {},
      );
      await holder(windows(), grants).sweepOnce();
      expect(forgotAll(calls)).toBe(true);
      const forgetAt = calls.findIndex((call) => call.join(" ") === "acl forget --all");
      const sweepAt = calls.findLastIndex((call) => call[0] === "user");
      expect(forgetAt).toBeLessThan(sweepAt);
      expect(existsSync(mark)).toBe(false);
    });

    it("takes them back without the mark when srt lists kept grants and its account is gone", async () => {
      const { calls, grants } = fakeGrants((args) =>
        args[0] === "user" ? { stdout: userStatus(false, "present") } : {},
      );
      await holder(windows(), grants).sweepOnce();
      expect(forgotAll(calls)).toBe(true);
    });

    it("keeps the mark and logs why when taking them back fails, and sessions still open", async () => {
      writeFileSync(mark, "");
      const { grants } = fakeGrants((args) =>
        args[0] === "acl" && args[2] === "--all" ? { status: 1, stderr: "a session runs" } : {},
      );
      const warnings: string[] = [];
      const sandbox = holder(windows(), grants, warnings);
      await sandbox.sweepOnce();
      expect(existsSync(mark)).toBe(true);
      expect(warnings.join()).toMatch(/next start.*a session runs/);
      await (await sandbox.open(makeProfile(base))).close();
    });

    it("takes nothing back in a host with administrator rights, and says so", async () => {
      writeFileSync(mark, "");
      const { calls, grants } = fakeGrants();
      const warnings: string[] = [];
      await holder(windows(true), grants, warnings).sweepOnce();
      expect(forgotAll(calls)).toBe(false);
      expect(existsSync(mark)).toBe(true);
      expect(warnings.join()).toMatch(/administrator rights too/);
    });

    it("counts a machine that can't say whether it is elevated as elevated", async () => {
      writeFileSync(mark, "");
      const { calls, grants } = fakeGrants();
      const { elevated: _, ...unsure } = windows();
      await holder(unsure as Machine, grants).sweepOnce();
      expect(forgotAll(calls)).toBe(false);
    });

    it("forgets nothing beyond the sweep without the mark or orphaned grants", async () => {
      const { calls, grants } = fakeGrants((args) =>
        args[0] === "user" ? { stdout: userStatus(true, "present") } : {},
      );
      await holder(windows(), grants).sweepOnce();
      expect(forgotAll(calls)).toBe(false);
    });

    it("takes nothing back in a host that doesn't hold the lock", async () => {
      writeFileSync(mark, "");
      const { calls, grants } = fakeGrants();
      const sandbox = new SrtSandbox(windows(), fakeRunner().runner, null, { grants });
      await (await sandbox.open(makeProfile(base))).close();
      expect(forgotAll(calls)).toBe(false);
      expect(existsSync(mark)).toBe(true);
    });

    it("does nothing on Linux", async () => {
      writeFileSync(mark, "");
      const { calls, grants } = fakeGrants();
      await holder(linux as Machine, grants).sweepOnce();
      expect(calls).toEqual([]);
    });
  });
});
