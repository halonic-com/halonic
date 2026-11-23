import { listOpenRunScopes } from "@halonicjs/adapter-cloudflare-storage";
import { parseScope, type Scope } from "@halonicjs/host-server";
import type { Clock } from "@halonicjs/std";
import type { RuntimeEnv } from "./env.ts";
import type { Runtime } from "./runtime.ts";
import { scopedRuntime } from "./scoped-runtime.ts";

/**
 * How many scopes one cron run sweeps at most. Each scope costs one call for its run list and up
 * to two per run it checks (at most 20 runs, see the watchdog), so 10 scopes stay near 400 calls,
 * well under the 1,000 a paid Worker invocation may make. Scopes beyond this are swept on later
 * runs, in turn.
 */
export const defaultScopesPerSweep = 10;

/** A run the sweep woke, with the scope it lives in; no scope for the deployment's own runs. */
export interface ScopedWokenRun {
  scope?: string;
  runId: string;
}

/**
 * What one sweep over the scopes did. `failures` holds every error, each naming the scope and the
 * run that failed, never a value; the other scopes and runs went on.
 */
export interface ScopedSweepReport {
  woken: ScopedWokenRun[];
  failures: Error[];
}

/** What {@link sweepEveryScope} needs besides the deployment's runtime. */
export interface ScopedSweepOptions {
  /** How many scopes one sweep visits; defaults to {@link defaultScopesPerSweep}. */
  scopesPerSweep?: number;
  /** Picks this minute's group of scopes; defaults to the runtime's clock. */
  clock?: Clock;
  /** The scopes with open runs; defaults to `listOpenRunScopes` on `env.DB`. */
  listScopes?: () => Promise<string[]>;
  /** A scope's runtime; defaults to {@link scopedRuntime}. */
  runtimeOf?: (scope: Scope) => Pick<Runtime, "watchdog">;
}

/**
 * The watchdog's sweep for a deployment with scopes: the deployment's own runs with its own
 * runtime, then each scope with an open run (`listOpenRunScopes`) with that scope's runtime, so a
 * stuck run is woken under the scope it was written in. A scope name that isn't a principal's
 * `u/<id>` or `o/<id>` can't have been written by a scope's runtime, so no runtime is built for it.
 *
 * The scopes are taken in turn like the watchdog takes runs: in order, cut into groups of
 * `scopesPerSweep`, the group chosen by the minute, with no memory between sweeps.
 *
 * @example
 * const report = await sweepEveryScope(env, runtime);
 */
export async function sweepEveryScope(
  env: RuntimeEnv,
  runtime: Pick<Runtime, "watchdog" | "clock">,
  options: ScopedSweepOptions = {},
): Promise<ScopedSweepReport> {
  const report: ScopedSweepReport = { woken: [], failures: [] };
  await sweepInto(report, undefined, runtime);

  let scopes: string[];
  try {
    scopes = await (options.listScopes ?? (() => listOpenRunScopes(env.DB)))();
  } catch (error) {
    report.failures.push(new Error("The watchdog couldn't list the scopes.", { cause: error }));
    return report;
  }
  const clock = options.clock ?? runtime.clock;
  const runtimeOf = options.runtimeOf ?? ((scope: Scope) => scopedRuntime(env, scope));
  for (const name of thisMinutesGroup(scopes, options.scopesPerSweep, clock)) {
    const scope = parseScope(name);
    if (scope !== null) {
      await sweepInto(report, name, runtimeOf(scope));
    }
  }
  return report;
}

/** Sweeps one runtime's runs and adds what happened to the report. */
async function sweepInto(
  report: ScopedSweepReport,
  scope: string | undefined,
  runtime: Pick<Runtime, "watchdog">,
): Promise<void> {
  const where = scope === undefined ? "" : ` in scope ${scope}`;
  try {
    const swept = await runtime.watchdog.sweep();
    for (const { runId } of swept.woken) {
      report.woken.push(scope === undefined ? { runId } : { scope, runId });
    }
    for (const { runId, error } of swept.failed) {
      report.failures.push(
        new Error(`The watchdog couldn't check run ${runId}${where}.`, { cause: error }),
      );
    }
  } catch (error) {
    report.failures.push(new Error(`The watchdog's sweep${where} failed.`, { cause: error }));
  }
}

/** The group of scopes this minute's sweep visits. */
function thisMinutesGroup(
  scopes: readonly string[],
  size = defaultScopesPerSweep,
  clock: Clock,
): string[] {
  const groups = Math.ceil(scopes.length / size);
  const minute = Math.floor(clock.now().getTime() / 60_000);
  const start = groups === 0 ? 0 : (minute % groups) * size;
  return scopes.slice(start, start + size);
}
