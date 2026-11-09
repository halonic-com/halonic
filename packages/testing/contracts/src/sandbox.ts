import { type Sandbox, type SandboxProfile, sandboxUnavailableReasons } from "@halonicjs/ports";
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
  network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
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
