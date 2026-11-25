import { randomIds, systemClock } from "@halonicjs/std";
import type { PluginLogger, PluginStateClient } from "@paperclipai/plugin-sdk";
import type { Snapshot } from "../snapshot/shape.ts";
import { engineLock } from "../workflow-host/engine-lock.ts";
import { dryRunExecutors } from "../workflow-host/executors.ts";
import { lifecyclePass } from "../workflow-host/lifecycle-pass.ts";

/**
 * The fast-track lifecycle inside each `pr-watch` pass (HAL-17774), in dry
 * run: it logs what the workflow and its executors would do, and writes
 * nothing to Paperclip or GitHub. A failure is logged and leaves the
 * watcher's own work alone.
 */

/** Runs the lifecycle on one company's snapshot. */
export interface LifecycleRunner {
  run(companyId: string, snapshot: Snapshot): Promise<void>;
}

/** The lifecycle of one worker, with its own engine lease owner. */
export function lifecycleRunner(ctx: {
  readonly state: Pick<PluginStateClient, "get" | "set" | "delete">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}): LifecycleRunner {
  const lock = engineLock(ctx.state, crypto.randomUUID());
  const ids = randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), systemClock);
  return {
    async run(companyId, snapshot) {
      const deps = {
        state: ctx.state,
        companyId,
        clock: systemClock,
        ids,
        lock,
        executors: dryRunExecutors,
      };
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
