import type {
  IssueComment,
  PluginAgentsClient,
  PluginCompaniesClient,
  PluginConfigClient,
  PluginEvent,
  PluginIssuesClient,
  PluginLogger,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import {
  type AskComment,
  asksDocument,
  askWindowMs,
  newAsks,
  readSeenAsks,
  rememberAsks,
} from "../board-check/asks.ts";
import {
  type BoardCheckSettings,
  readBoardCheckSettings,
  writesOn,
} from "../board-check/settings.ts";
import {
  type BoardWrite,
  type BoardWriteApi,
  commitWrites,
  type GateRefusal,
  type WriteGate,
} from "../board-check/writes.ts";
import { everyIssue } from "./host.ts";
import { companyConfig } from "./job.ts";
import { manifest } from "./manifest.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The `board-check` job and the wake-on-ask path (HAL-16194, the Board
 * Checker addendum on HAL-15997). Everything it writes goes through the
 * gate in `../board-check/writes.ts`; this file only reads and plans.
 * Its log names ids, counts and error codes, never comment or error text.
 */

/** The part of the plugin context the board check uses, so tests can fake it. */
export interface BoardCheckApi extends MetricsApi {
  readonly issues: BoardWriteApi["issues"] &
    Pick<PluginIssuesClient, "list" | "get" | "listComments">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly state: Pick<PluginStateClient, "get" | "set">;
  readonly config: PluginConfigClient;
  readonly companies: Pick<PluginCompaniesClient, "list">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** What one part of a pass wants written, and what it saves once the gate let the pass through. */
interface PartPlan {
  readonly writes: readonly BoardWrite[];
  readonly save: () => Promise<void>;
}

type Trigger = "event" | "job";

const asksKey = (companyId: string) =>
  ({
    scopeKind: "company",
    scopeId: companyId,
    namespace: "board-check",
    stateKey: "asks",
  }) as const;

/** An error's code or name for the log; its message may quote what it failed on. */
export function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" || typeof code === "number"
    ? String(code)
    : ((error as Error | null)?.name ?? "Error");
}

function askComment(task: { id: string; identifier: string | null }) {
  return (comment: IssueComment): AskComment => ({
    id: comment.id,
    taskId: task.id,
    identifier: task.identifier ?? "",
    authorAgentId: comment.authorType === "agent" ? comment.authorAgentId : null,
    createdAt: new Date(comment.createdAt).toISOString(),
    origin: comment.origin,
    body: comment.deletedAt == null ? comment.body : "",
  });
}

/** The tasks to read comments on: the one an event names, or every open task active in the window. */
async function askTasks(ctx: BoardCheckApi, companyId: string, now: Date, only?: string) {
  if (only !== undefined) {
    const task = await ctx.issues.get(only, companyId);
    return task === null ? [] : [task];
  }
  const since = now.getTime() - askWindowMs;
  return (await everyIssue(ctx, companyId)).filter(
    (task) => new Date(task.lastActivityAt ?? task.updatedAt).getTime() >= since,
  );
}

/** Spots new asks; plans the `board-asks` document and one wake of the Board Checker for the batch. */
async function planAsks(
  ctx: BoardCheckApi,
  companyId: string,
  checkerTaskId: string,
  now: Date,
  only?: string,
): Promise<PartPlan & { readonly found: number }> {
  const checkerTask = await ctx.issues.get(checkerTaskId, companyId);
  const agents = await ctx.agents.list({ companyId, limit: 500 });
  const rules = {
    boardCheckerAgentId: checkerTask?.assigneeAgentId ?? undefined,
    mergerAgentId: agents.find((agent) => agent.urlKey === "merger")?.id,
  };
  const seen = readSeenAsks(await ctx.state.get(asksKey(companyId)));
  const seenIds = new Set(seen.map((ask) => ask.commentId));
  const found = [];
  for (const task of await askTasks(ctx, companyId, now, only)) {
    const comments = (await ctx.issues.listComments(task.id, companyId)).map(askComment(task));
    found.push(...newAsks(comments, seenIds, rules, now));
  }
  const first = found[0];
  if (first === undefined) {
    return { writes: [], save: async () => {}, found: 0 };
  }
  const tasks = [...new Set(found.map((ask) => ask.identifier))].join(", ");
  ctx.logger.info(`Board check: ${found.length} new board asks on ${tasks}.`, { companyId });
  const remembered = rememberAsks(seen, found, now);
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  return {
    writes: [
      { kind: "document", key: "board-asks", body: asksDocument(remembered, names, now) },
      {
        kind: "wake",
        taskId: checkerTaskId,
        reason: "board_check_ask",
        key: `board-check ask ${first.commentId}`,
      },
    ],
    save: () => ctx.state.set(asksKey(companyId), remembered),
    found: found.length,
  };
}

function gateFor(ctx: BoardCheckApi, companyId: string, settings: BoardCheckSettings): WriteGate {
  const checkerTaskId = settings.boardCheckerTaskId ?? "";
  return {
    companyId,
    boardCheckerTaskId: checkerTaskId,
    commentTasks: new Set([checkerTaskId]),
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
  const parts = [asks];
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
  };
}
