import type { PluginEvent } from "@paperclipai/plugin-sdk";
import {
  type BoardCheckSettings,
  readBoardCheckSettings,
  writesOn,
} from "../board-check/settings.ts";
import { ceilings, commitWrites, type GateRefusal, type WriteGate } from "../board-check/writes.ts";
import { type BoardCheckApi, errorCode, type PartPlan, type Trigger } from "./board-check-api.ts";
import { planApprovalsPart } from "./board-check-approvals.ts";
import { type AskScope, planAsks } from "./board-check-asks.ts";
import { planMergeSpeed } from "./board-check-merge-speed.ts";
import { planPilesPart } from "./board-check-piles.ts";
import { planRuleChecks } from "./board-check-rule-checks.ts";
import { planRuns, recordFailedRun } from "./board-check-runs.ts";
import { planStalePart } from "./board-check-stale.ts";
import { planWaiting } from "./board-check-waiting.ts";
import { type CompanySource, listedCompanies } from "./companies.ts";
import { automaticNoteIds, isAutomaticNote } from "./front-bot-notes.ts";
import { everyIssue } from "./host.ts";
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
      [checkerTaskId, settings.seatSupervisorTaskId, settings.chiefTaskId].filter(
        (taskId): taskId is string => taskId !== undefined,
      ),
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

/** Parts (b), (c) and (e), the queued-run piles of part (a) and the stale tasks run on the first job pass of each hour. */
export function hourlyPass(trigger: Trigger, now: Date): boolean {
  return trigger === "job" && now.getUTCMinutes() < 10;
}

/** The job's parts after the asks; the hourly ones plan from the pass's one listing of open tasks. */
async function planJobParts(
  ctx: BoardCheckApi,
  companyId: string,
  settings: BoardCheckSettings & { boardCheckerTaskId: string },
  openTasks: Awaited<ReturnType<typeof everyIssue>>,
  asks: PartPlan,
  now: Date,
): Promise<PartPlan[]> {
  // The ask's wake comes first; failed runs get the wakes left under the ceiling.
  const asksWakes = asks.writes.filter((write) => write.kind === "wake").length;
  const parts = [
    await planRuns(ctx, companyId, settings.seatSupervisorTaskId, ceilings.wake - asksWakes),
  ];
  const agents = await ctx.agents.list({ companyId, limit: 500 });
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  parts.push(await planApprovalsPart(ctx, companyId, settings.boardCheckerTaskId, names));
  parts.push(await planRuleChecks(ctx, companyId, { openTasks, agents }, now));
  const hourly = hourlyPass("job", now);
  parts.push(await planMergeSpeed(ctx, companyId, settings.boardCheckerTaskId, hourly, now));
  if (hourly) {
    const input = { openTasks, agents, chiefTaskId: settings.chiefTaskId };
    parts.push(await planWaiting(ctx, companyId, input, now));
    const checker = settings.boardCheckerTaskId;
    parts.push(
      await planPilesPart(ctx, companyId, { openTasks, boardCheckerTaskId: checker, names }, now),
    );
    // Last, so it fits in what the other parts leave under the gate's ceilings.
    const planned = [asks, ...parts].flatMap((part) => part.writes);
    const stale = { openTasks, chiefTaskId: settings.chiefTaskId, planned };
    parts.push(await planStalePart(ctx, companyId, stale, now));
  }
  return parts;
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
  // One listing of open tasks per job pass, shared by every part that reads tasks.
  const openTasks = only === undefined ? await everyIssue(ctx, companyId) : [];
  const scope: AskScope = only === undefined ? { openTasks } : { only };
  const askTasks = {
    checkerTaskId: settings.boardCheckerTaskId,
    wakeTaskId: settings.askWakeTaskId,
  };
  const asks = await planAsks(ctx, companyId, askTasks, now, scope);
  const parts: PartPlan[] = [asks];
  if (trigger === "job") {
    parts.push(...(await planJobParts(ctx, companyId, settings, openTasks, asks, now)));
  }
  const outcome = await commitWrites(
    ctx,
    gateFor(ctx, companyId, settings),
    parts.flatMap((part) => part.writes),
  );
  if (outcome.refused === undefined) {
    for (const part of parts) {
      await part.save(outcome.sent);
    }
  }
  await writeMetrics(
    ctx,
    {
      "board_check.asks_new": asks.found,
      "board_check.writes": outcome.written,
      "board_check.writes_logged": outcome.logged,
      // One per finished job pass, for the missed-pass alert (HAL-18857); event passes don't count.
      ...(trigger === "job" ? { "board_check.job_passes": 1 } : {}),
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
  /** A catch-up pass for every company in `companies` with a Board Checker task set. */
  run(now: Date, companies?: CompanySource): Promise<void>;
  /** A new comment: look at its task for an ask right away instead of waiting for the job. */
  onCommentCreated(event: PluginEvent, now: Date): Promise<void>;
  /** A failed run: keep it, as ids and a cause code, for the next pass and `failed_runs`. */
  onRunFailed(event: PluginEvent, now: Date): Promise<void>;
}

/** Whether the new comment is one of the front bot's: its id is on the bot's list, or it is an authorless note. */
async function isFrontBotComment(
  ctx: BoardCheckApi,
  companyId: string,
  taskId: string,
  commentId: string | undefined,
): Promise<boolean> {
  if (commentId === undefined) {
    return false;
  }
  const ownIds = await automaticNoteIds(ctx.state, companyId, taskId);
  if (ownIds.has(commentId)) {
    return true;
  }
  // The event can come before the bot saved the id, so the comment itself is read too.
  const comments = await ctx.issues.listComments(taskId, companyId);
  const comment = comments.find((candidate) => candidate.id === commentId);
  return comment !== undefined && isAutomaticNote(comment, ownIds);
}

/** The board check for one plugin worker. */
export function boardCheck(ctx: BoardCheckApi): BoardCheck {
  const serially = serialPerCompany();
  return {
    async run(now, companies = listedCompanies) {
      let failed = 0;
      for (const companyId of await companies(ctx)) {
        failed += (await checkCompany(ctx, serially, companyId, now, "job")) ? 0 : 1;
      }
      if (failed > 0) {
        throw new Error(`Board check: ${failed} companies couldn't be checked; see the log.`);
      }
    },
    async onCommentCreated(event, now) {
      const payload = (event.payload ?? {}) as { issueId?: unknown; commentId?: unknown };
      const taskId = typeof payload.issueId === "string" ? payload.issueId : event.entityId;
      const commentId = typeof payload.commentId === "string" ? payload.commentId : undefined;
      // The front bot's Automatic note is no board ask (HAL-19136).
      if (
        taskId !== undefined &&
        (await isFrontBotComment(ctx, event.companyId, taskId, commentId))
      ) {
        return;
      }
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
