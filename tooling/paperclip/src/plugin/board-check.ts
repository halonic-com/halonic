import type { PluginEvent } from "@paperclipai/plugin-sdk";
import {
  type BoardCheckSettings,
  readBoardCheckSettings,
  writesOn,
} from "../board-check/settings.ts";
import { ceilings, commitWrites, type GateRefusal, type WriteGate } from "../board-check/writes.ts";
import { type BoardCheckApi, errorCode, type PartPlan, type Trigger } from "./board-check-api.ts";
import { planAsks } from "./board-check-asks.ts";
import { planRuns, recordFailedRun } from "./board-check-runs.ts";
import { companyConfig } from "./job.ts";
import { manifest } from "./manifest.ts";
import { writeMetrics } from "./metrics.ts";

/**
 * The `board-check` job, the wake on a board ask and the failed-run record
 * (HAL-16194, the Board Checker addendum on HAL-15997). Everything it
 * writes goes through the gate in `../board-check/writes.ts`; the parts
 * only read and plan.
 * Its log names ids, counts and error codes, never comment or error text.
 */

function gateFor(ctx: BoardCheckApi, companyId: string, settings: BoardCheckSettings): WriteGate {
  const checkerTaskId = settings.boardCheckerTaskId ?? "";
  return {
    companyId,
    boardCheckerTaskId: checkerTaskId,
    commentTasks: new Set(
      settings.seatSupervisorTaskId === undefined
        ? [checkerTaskId]
        : [checkerTaskId, settings.seatSupervisorTaskId],
    ),
    // Read again before every write, so the board's switch stops the next write at once.
    writesOn: async () =>
      writesOn(readBoardCheckSettings(await ctx.config.get(companyId)), manifest.version),
    log: (line) => ctx.logger.info(line, { companyId }),
    alert: async (why: GateRefusal) => {
      ctx.logger.error(`Board check: the write gate refused a pass (${why}); wrote nothing.`, {
        companyId,
      });
      await writeMetrics(ctx, { "board_check.gate_refused": 1 }, { companyId, reason: why });
    },
  };
}

/** One pass for one company: plan every part, send the writes through the gate, then save. */
async function pass(
  ctx: BoardCheckApi,
  companyId: string,
  settings: BoardCheckSettings & { boardCheckerTaskId: string },
  now: Date,
  trigger: Trigger,
  only?: string,
): Promise<void> {
  const asks = await planAsks(ctx, companyId, settings.boardCheckerTaskId, now, only);
  const parts: PartPlan[] = [asks];
  if (trigger === "job") {
    // The ask's wake comes first; failed runs get the wakes left under the ceiling.
    const asksWakes = asks.writes.filter((write) => write.kind === "wake").length;
    parts.push(
      await planRuns(ctx, companyId, settings.seatSupervisorTaskId, ceilings.wake - asksWakes),
    );
  }
  const outcome = await commitWrites(
    ctx,
    gateFor(ctx, companyId, settings),
    parts.flatMap((part) => part.writes),
  );
  if (outcome.refused === undefined) {
    for (const part of parts) {
      await part.save();
    }
  }
  await writeMetrics(
    ctx,
    {
      "board_check.asks_new": asks.found,
      "board_check.writes": outcome.written,
      "board_check.writes_logged": outcome.logged,
    },
    { companyId, trigger },
  );
}

/** Runs `work` after the company's previous pass, so an event and the job never race. */
type Serial = (companyId: string, work: () => Promise<void>) => Promise<void>;

function serialPerCompany(): Serial {
  const running = new Map<string, Promise<void>>();
  return (companyId, work) => {
    const next = (running.get(companyId) ?? Promise.resolve()).then(work, work);
    running.set(
      companyId,
      next.catch(() => {}),
    );
    return next;
  };
}

/** Runs a pass for a company whose settings name the Board Checker's task. Returns false if it failed. */
async function checkCompany(
  ctx: BoardCheckApi,
  serially: Serial,
  companyId: string,
  now: Date,
  trigger: Trigger,
  only?: string,
): Promise<boolean> {
  try {
    const config = await companyConfig(ctx.config, companyId);
    const settings = readBoardCheckSettings(config ?? {});
    const checkerTaskId = settings.boardCheckerTaskId;
    if (checkerTaskId === undefined) {
      return true;
    }
    await serially(companyId, () =>
      pass(ctx, companyId, { ...settings, boardCheckerTaskId: checkerTaskId }, now, trigger, only),
    );
    return true;
  } catch (error) {
    ctx.logger.error(`Board check: couldn't run (${errorCode(error)}).`, { companyId });
    return false;
  }
}

/** The board check's two entry points, sharing one queue of passes per company. */
export interface BoardCheck {
  /** The `board-check` job: a catch-up pass for every company with a Board Checker task set. */
  run(now: Date): Promise<void>;
  /** A new comment: look at its task for an ask right away instead of waiting for the job. */
  onCommentCreated(event: PluginEvent, now: Date): Promise<void>;
  /** A failed run: keep it, as ids and a cause code, for the next pass and `failed_runs`. */
  onRunFailed(event: PluginEvent, now: Date): Promise<void>;
}

/** The board check for one plugin worker. */
export function boardCheck(ctx: BoardCheckApi): BoardCheck {
  const serially = serialPerCompany();
  return {
    async run(now) {
      let failed = 0;
      for (const company of await ctx.companies.list()) {
        failed += (await checkCompany(ctx, serially, company.id, now, "job")) ? 0 : 1;
      }
      if (failed > 0) {
        throw new Error(`Board check: ${failed} companies couldn't be checked; see the log.`);
      }
    },
    async onCommentCreated(event, now) {
      const payload = (event.payload ?? {}) as { issueId?: unknown };
      const taskId = typeof payload.issueId === "string" ? payload.issueId : event.entityId;
      if (taskId !== undefined) {
        await checkCompany(ctx, serially, event.companyId, now, "event", taskId);
      }
    },
    async onRunFailed(event, now) {
      try {
        await serially(event.companyId, () => recordFailedRun(ctx, event, now));
      } catch (error) {
        ctx.logger.error(`Board check: couldn't keep a failed run (${errorCode(error)}).`, {
          companyId: event.companyId,
        });
      }
    },
  };
}
