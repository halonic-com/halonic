import {
  RoutinesObject as AdapterRoutinesObject,
  defaultRoutinesObjectName,
} from "@halonicjs/adapter-cloudflare-durable";
import { readRoutineIndex } from "@halonicjs/adapter-cloudflare-storage";
import { workspaceRoutineScheduler } from "@halonicjs/app";
import type { RoutineScheduler, RoutineTickResult } from "@halonicjs/app/routines";
import type { AssembledEngine } from "@halonicjs/engine";
import type { SchedulerListener } from "@halonicjs/ports";
import { DEFAULT_TICK_POLICY } from "@halonicjs/routines";
import type { RuntimeEnv } from "./env.ts";
import { createRuntime, type Runtime } from "./runtime.ts";
import { workerEngine } from "./worker-runs.ts";

/**
 * The workspace id the deployment's routine scheduler ticks under. A deployment holds one
 * workspace, so a fixed id names it. Never change it: the last-tick key and every routine run id
 * are built from it, so a new value would start the routines' current minute a second time.
 */
export const deploymentWorkspaceId = "deployment";

/**
 * The Worker's routines object. On the deployment's object, each tick runs the workspace's
 * scheduled routines: the routine scheduler of `@halonicjs/app` on the deployment's runtime,
 * with the routines from the snapshot's routine index, read fresh on every tick, and the runs
 * started on the Worker's engine (`workerEngine`). Due times are in UTC (`DEFAULT_TICK_POLICY`).
 *
 * Scheduled routines belong to the deployment: every scope reads the deployment's definitions,
 * so a scope's routines object that ticked would start each routine once more (HAL-17175). The
 * Worker only ticks the deployment's object; a tick or a backup alarm on any other does nothing.
 *
 * A routine run that fails to start, such as an agent routine, which the Worker can't start yet,
 * makes the tick reject, so the cron run shows as failed; the other routines still start.
 *
 * The Worker exports it as `RoutinesObject`, the class name Cloudflare keys the objects' data by.
 */
export class RoutinesObject extends AdapterRoutinesObject {
  #scheduler: Promise<RoutineScheduler> | undefined;

  protected override tickListener(): Pick<SchedulerListener, "onTick"> {
    return {
      onTick: async () => {
        if (!this.#isDeployments()) return;
        const scheduler = await this.#routineScheduler();
        throwFailedStarts(await scheduler.tick());
      },
    };
  }

  /** The engine the routine runs start on: the Worker's. Only a test gives it another model. */
  protected engineOf(runtime: Runtime): AssembledEngine {
    return workerEngine(runtime);
  }

  #isDeployments(): boolean {
    const { ROUTINES } = this.env as unknown as Pick<RuntimeEnv, "ROUTINES">;
    return this.ctx.id.equals(ROUTINES.idFromName(defaultRoutinesObjectName));
  }

  /** The routine scheduler, built on first use. A failed build isn't kept, so the next tick builds again. */
  #routineScheduler(): Promise<RoutineScheduler> {
    this.#scheduler ??= createRuntime(this.env as unknown as RuntimeEnv)
      .then((runtime) => this.#schedulerOn(runtime))
      .catch((error: unknown) => {
        this.#scheduler = undefined;
        throw error;
      });
    return this.#scheduler;
  }

  #schedulerOn(runtime: Runtime): RoutineScheduler {
    return workspaceRoutineScheduler({
      workspaceId: deploymentWorkspaceId,
      // Read through `this`, so a test's clock counts.
      clock: { now: () => this.clock.now() },
      coordination: runtime.coordination,
      executor: this.engineOf(runtime).executor,
      runs: runtime.runStore,
      routines: () => readRoutineIndex(runtime.definitions),
      policy: DEFAULT_TICK_POLICY,
    });
  }
}

/**
 * Rejects when a due run failed to start, naming each routine and time, never a value; each
 * start's error is the cause.
 *
 * @throws AggregateError when `result.failed` isn't empty
 */
function throwFailedStarts(result: RoutineTickResult): void {
  if (result.failed.length === 0) return;
  const failures = result.failed.map(
    ({ key, at, error }) =>
      new Error(`Routine ${key} couldn't start its run for ${at}.`, { cause: error }),
  );
  throw new AggregateError(failures, failures.map((failure) => failure.message).join(" "));
}
