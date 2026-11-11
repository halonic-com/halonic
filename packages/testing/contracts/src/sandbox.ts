import {
  type Sandbox,
  type SandboxCommand,
  type SandboxProfile,
  type SandboxSession,
  sandboxUnavailableReasons,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** Creates the sandbox under test. */
export type MakeSandbox = () => Promise<Sandbox>;

/** What the adapter's test harness hands the {@link sandboxCheckContract}. */
export interface SandboxCheckHarness {
  /** The adapter as it is on this machine, which may or may not be able to start. */
  make: MakeSandbox;
  /**
   * The adapter set up so it can't start here, for example with its probe
   * told that bubblewrap is missing.
   */
  makeUnavailable: MakeSandbox;
}

/** A profile that any sandbox could open, if it could start at all. */
const plainProfile: SandboxProfile = {
  workingFolder: "/contract/work",
  tempFolder: "/contract/temp",
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 1000,
};

/**
 * The part of the {@link Sandbox} contract about `check`: every adapter says
 * whether it can start, with a listed reason when it can't, and one that
 * can't start opens nothing. The session cases join it with the first
 * adapter (HAL-193).
 */
export function sandboxCheckContract(name: string, harness: SandboxCheckHarness): void {
  verifies("contracts.sandbox-check", () => {
    describe(`Sandbox check contract: ${name}`, () => {
      it("gives no reason and nothing missing when it can start, and a listed reason when not", async () => {
        const sandbox = await harness.make();
        const check = await sandbox.check();
        expect({
          hasReason: check.reason !== null,
          missesSomething: check.missing.length > 0,
        }).toEqual({ hasReason: !check.ok, missesSomething: !check.ok });
        expect([null, ...sandboxUnavailableReasons]).toContain(check.reason);
      });

      it("gives a listed reason and what is missing when it can't start", async () => {
        const sandbox = await harness.makeUnavailable();
        const check = await sandbox.check();
        expect(check.ok).toBe(false);
        // Checked at run time too: an adapter in JavaScript or with a cast gets past the type.
        expect(sandboxUnavailableReasons).toContain(check.reason);
        expect(check.missing.length).toBeGreaterThan(0);
        expect(check.missing.filter((sentence) => sentence.trim() === "")).toEqual([]);
      });

      it("opens no session when it can't start, so nothing runs without the fence", async () => {
        const sandbox = await harness.makeUnavailable();
        await expect(sandbox.open(plainProfile)).rejects.toThrow();
      });
    });
  });
}

/** What the adapter's test harness hands the {@link sandboxFenceContract}. */
export interface SandboxFenceHarness {
  /**
   * A session of the adapter whose fence proof came out `not-fenced`: its
   * probes were told that the canary file is readable, for example. The
   * adapter reports the proof as the port says; the suite checks what the
   * session then does.
   */
  openNotFenced(): Promise<SandboxSession>;
  /** The program the adapter would have started, to check nothing was. */
  startedPrograms(): number;
}

/** A command any sandbox could run, if the fence held. */
const plainCommand: SandboxCommand = { program: "contract-program", args: [] };

/**
 * The part of the {@link Sandbox} contract about the fence proof: a session
 * whose proof is `not-fenced` says so with a reason, and its `start` throws
 * and starts nothing, so a program never runs outside the fence by a
 * session that couldn't prove it (the port's \"never falls back\" rule).
 */
export function sandboxFenceContract(name: string, harness: SandboxFenceHarness): void {
  verifies("contracts.sandbox-fence", () => {
    describe(`Sandbox fence contract: ${name}`, () => {
      it("reports not-fenced with a reason in plain words", async () => {
        const session = await harness.openNotFenced();
        try {
          expect(session.fence.state).toBe("not-fenced");
          if (session.fence.state === "not-fenced") {
            expect(session.fence.reason.trim()).not.toBe("");
          }
        } finally {
          await session.close();
        }
      });

      it("throws from start and starts no program when it isn't fenced", async () => {
        const session = await harness.openNotFenced();
        try {
          await expect(session.start(plainCommand)).rejects.toThrow();
          expect(harness.startedPrograms()).toBe(0);
        } finally {
          await session.close();
        }
      });
    });
  });
}
