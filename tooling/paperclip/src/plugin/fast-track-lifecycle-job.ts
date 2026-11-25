import { randomIds, systemClock } from "@halonicjs/std";
import type { PluginLogger, PluginStateClient } from "@paperclipai/plugin-sdk";
import type { Snapshot } from "../snapshot/shape.ts";
import { engineLock } from "../workflow-host/engine-lock.ts";
import { dryRunExecutors } from "../workflow-host/executors.ts";
import { lifecyclePass } from "../workflow-host/lifecycle-pass.ts";
import {
  prWatcherLifecyclePass,
  type WatcherPass,
} from "../workflow-host/pr-watcher-lifecycle-pass.ts";

/**
 * The fast-track lifecycle inside each `pr-watch` pass (HAL-17774), and the
 * PR watcher's lifecycle beside it (HAL-18197), in dry
 * run: it logs what the workflow and its executors would do, and writes
 * nothing to Paperclip or GitHub. A failure is logged and leaves the
 * watcher's own work alone.
 */

/** Runs the lifecycles of one company's pass. */
export interface LifecycleRunner {
  /** The fast-track lifecycle, on the pass's GitHub snapshot. */
  run(companyId: string, snapshot: Snapshot): Promise<void>;
  /** The PR watcher's lifecycle, on what the watcher read and the signal rule's actions. */
  runPrWatcher(companyId: string, pass: WatcherPass): Promise<void>;
}

/** The lifecycle of one worker, with its own engine lease owner. */
export function lifecycleRunner(ctx: {
  readonly state: Pick<PluginStateClient, "get" | "set" | "delete">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}): LifecycleRunner {
  const lock = engineLock(ctx.state, crypto.randomUUID());
  const ids = randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), systemClock);
  const depsOf = (companyId: string) => ({
    state: ctx.state,
    companyId,
    clock: systemClock,
    ids,
    lock,
  });
  return {
    async runPrWatcher(companyId, pass) {
      try {
        const result = await prWatcherLifecyclePass(depsOf(companyId), pass);
        if (result === "held-elsewhere") {
          ctx.logger.info("PR watcher lifecycle: another worker runs the engine, skipped.", {
            companyId,
          });
          return;
        }
        for (const line of result.lines) {
          ctx.logger.info(line, { companyId });
        }
      } catch (error) {
        ctx.logger.error(`PR watcher lifecycle: couldn't run: ${(error as Error).message}`, {
          companyId,
        });
      }
    },
    async run(companyId, snapshot) {
      const deps = { ...depsOf(companyId), executors: dryRunExecutors };
      try {
        const result = await lifecyclePass(deps, snapshot);
        if (result === "held-elsewhere") {
          ctx.logger.info("Fast-track lifecycle: another worker runs the engine, skipped.", {
            companyId,
          });
          return;
        }
        for (const line of result.lines) {
          ctx.logger.info(line, { companyId });
        }
        ctx.logger.info(
          `Fast-track lifecycle (dry run): ${result.actions.length} actions from a ${result.inputBytes}-byte rule input.`,
          { companyId },
        );
      } catch (error) {
        ctx.logger.error(`Fast-track lifecycle: couldn't run: ${(error as Error).message}`, {
          companyId,
        });
      }
    },
  };
}
