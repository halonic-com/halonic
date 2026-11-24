import type { Watchdog, WatchdogReport } from "@halonicjs/adapter-cloudflare-durable";
import { type Scope, scopeName } from "@halonicjs/host-server";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "./env.ts";
import { type ScopedSweepOptions, sweepEveryScope } from "./scoped-sweep.ts";

const personal = "u/eu_acme0000000000001";
const organisation = "o/org_acme0000000000001";
const env = {} as RuntimeEnv;

/** A watchdog whose sweep gives `report`, or throws `error`. */
function watchdogOf(outcome: WatchdogReport | Error): Pick<Watchdog, "sweep"> {
  return {
    sweep: async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  } as Pick<Watchdog, "sweep">;
}

const quiet: WatchdogReport = { woken: [], failed: [], deferred: 0 };

/** A deployment's runtime with `own` as its sweep, at minute `minute`. */
function deploymentAt(own: WatchdogReport | Error = quiet, minute = 0) {
  return {
    watchdog: watchdogOf(own) as Watchdog,
    clock: { now: () => new Date(minute * 60_000) },
  };
}

/** Options whose scopes are `scopes`, each swept as `reports` says (quiet otherwise). */
function scopesOf(
  scopes: string[],
  reports: Record<string, WatchdogReport | Error> = {},
): ScopedSweepOptions & { built: string[] } {
  const built: string[] = [];
  return {
    built,
    listScopes: async () => scopes,
    runtimeOf: (scope: Scope) => {
      built.push(scopeName(scope));
      return { watchdog: watchdogOf(reports[scopeName(scope)] ?? quiet) as Watchdog };
    },
  };
}

verifies("runtime.scoped-watchdog", () => {
  describe("the sweep over every scope in Node", () => {
    it("sweeps the deployment's runs, then each scope's with its own runtime", async () => {
      const options = scopesOf([organisation, personal], {
        [personal]: { woken: [{ runId: "r2", reason: "no-progress" }], failed: [], deferred: 0 },
      });
      const own: WatchdogReport = {
        woken: [{ runId: "r1", reason: "overdue-timer" }],
        failed: [],
        deferred: 0,
      };
      const report = await sweepEveryScope(env, deploymentAt(own), options);
      expect(options.built).toEqual([organisation, personal]);
      expect(report).toEqual({
        woken: [{ runId: "r1" }, { scope: personal, runId: "r2" }],
        failures: [],
      });
    });

    it("builds no runtime for a name that is no principal's scope", async () => {
      const options = scopesOf(["acme-legacy", "u/", personal]);
      await sweepEveryScope(env, deploymentAt(), options);
      expect(options.built).toEqual([personal]);
    });

    it("goes on past a scope that fails, and names the scope and the run", async () => {
      const options = scopesOf([organisation, personal], {
        [organisation]: new Error("secret-detail"),
        [personal]: { woken: [], failed: [{ runId: "r1", error: new Error("boom") }], deferred: 0 },
      });
      const report = await sweepEveryScope(env, deploymentAt(new Error("own")), options);
      expect(report.failures.map((failure) => failure.message)).toEqual([
        "The watchdog's sweep failed.",
        `The watchdog's sweep in scope ${organisation} failed.`,
        `The watchdog couldn't check run r1 in scope ${personal}.`,
      ]);
    });

    it("reports a scope list it can't read, after the deployment's own sweep", async () => {
      const own: WatchdogReport = {
        woken: [{ runId: "r1", reason: "overdue-timer" }],
        failed: [],
        deferred: 0,
      };
      const report = await sweepEveryScope(env, deploymentAt(own), {
        listScopes: async () => {
          throw new Error("secret-detail");
        },
      });
      expect(report.woken).toEqual([{ runId: "r1" }]);
      expect(report.failures.map((failure) => failure.message)).toEqual([
        "The watchdog couldn't list the scopes.",
      ]);
    });

    it("takes the scopes in turn by the minute", async () => {
      const scopes = ["o/org_acme0000000000001", "o/org_acme0000000000002", personal];
      const builtAt = async (minute: number) => {
        const options = { ...scopesOf(scopes), scopesPerSweep: 2 };
        await sweepEveryScope(env, deploymentAt(quiet, minute), options);
        return options.built;
      };
      expect(await builtAt(0)).toEqual(scopes.slice(0, 2));
      expect(await builtAt(1)).toEqual([personal]);
      expect(await builtAt(2)).toEqual(scopes.slice(0, 2));
    });
  });
});
