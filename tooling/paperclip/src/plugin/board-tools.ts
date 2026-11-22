import type {
  PluginAgentsClient,
  PluginConfigClient,
  PluginIssuesClient,
  PluginStateClient,
  PluginToolsClient,
  ToolResult,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { askLink, readSeenAsks, type SeenAsk } from "../board-check/asks.ts";
import { type FailedRun, readRecord } from "../board-check/failed-runs.ts";
import { readBoardCheckSettings } from "../board-check/settings.ts";
import { errorCode, stateKey } from "./board-check-api.ts";
import { manifest } from "./manifest.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The board check's read tools, `board_asks` and `failed_runs`. They read
 * only what the board check kept in plugin state and a few task fields, so
 * a call costs no GitHub request. Answers carry ids, names, times and cause
 * codes, never comment or error text.
 */

/** The part of the plugin context the board tools use, so tests can fake it. */
export interface BoardToolsApi extends MetricsApi {
  readonly tools: Pick<PluginToolsClient, "register">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments">;
  readonly state: Pick<PluginStateClient, "get">;
  readonly config: PluginConfigClient;
}

const dayMs = 24 * 60 * 60_000;

/** `since` as an ISO time, 24 hours back when it's missing, or a message when it isn't a time. */
export function readSince(params: unknown, now: Date): Date | string {
  const { since } = (params ?? {}) as { since?: unknown };
  if (since === undefined || since === null || since === "") {
    return new Date(now.getTime() - dayMs);
  }
  const time = typeof since === "string" ? Date.parse(since) : Number.NaN;
  return Number.isNaN(time)
    ? "since must be an ISO time, such as 2026-11-22T12:00:00Z."
    : new Date(time);
}

async function agentNames(ctx: BoardToolsApi, companyId: string): Promise<Map<string, string>> {
  const agents = await ctx.agents.list({ companyId, limit: 500 });
  return new Map(agents.map((agent) => [agent.id, agent.name]));
}

/** Whether the board or the Board Checker commented on the ask's task after the ask. */
async function answered(
  ctx: BoardToolsApi,
  ask: SeenAsk,
  checkerAgentId: string | null,
  companyId: string,
): Promise<boolean> {
  const comments = await ctx.issues.listComments(ask.taskId, companyId);
  return comments.some(
    (comment) =>
      new Date(comment.createdAt).toISOString() > ask.createdAt &&
      (comment.authorType === "user" ||
        (checkerAgentId !== null && comment.authorAgentId === checkerAgentId)),
  );
}

async function boardAsks(ctx: BoardToolsApi, companyId: string, since: Date): Promise<ToolResult> {
  const settings = readBoardCheckSettings(await ctx.config.get(companyId));
  const checkerTask =
    settings.boardCheckerTaskId === undefined
      ? null
      : await ctx.issues.get(settings.boardCheckerTaskId, companyId);
  const names = await agentNames(ctx, companyId);
  const asks = readSeenAsks(await ctx.state.get(stateKey(companyId, "asks")))
    .filter((ask) => Date.parse(ask.createdAt) >= since.getTime())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows = [];
  for (const ask of asks) {
    const done = await answered(ctx, ask, checkerTask?.assigneeAgentId ?? null, companyId);
    rows.push({
      ...ask,
      author: names.get(ask.authorAgentId) ?? ask.authorAgentId,
      answered: done,
      link: askLink(ask),
    });
  }
  const lines = rows.map(
    (row) =>
      `- ${row.identifier}, comment ${row.commentId} by ${row.author} at ${row.createdAt}: ${row.answered ? "answered" : "open"} (${row.link})`,
  );
  return {
    content: [
      `Board asks since ${since.toISOString()}: ${rows.length}. No comment text: open the link to read one.`,
      ...lines,
    ].join("\n"),
    data: rows,
  };
}

function byAgent(runs: readonly FailedRun[]): Map<string, FailedRun[]> {
  const groups = new Map<string, FailedRun[]>();
  for (const run of runs) {
    groups.set(run.agentId, [...(groups.get(run.agentId) ?? []), run]);
  }
  return groups;
}

async function failedRuns(ctx: BoardToolsApi, companyId: string, since: Date): Promise<ToolResult> {
  const record = readRecord(await ctx.state.get(stateKey(companyId, "failed-runs")));
  const runs = record.runs.filter((run) => Date.parse(run.at) >= since.getTime());
  const names = await agentNames(ctx, companyId);
  const identifiers = new Map<string, string>();
  for (const taskId of new Set(runs.flatMap((run) => run.taskId ?? []))) {
    identifiers.set(taskId, (await ctx.issues.get(taskId, companyId))?.identifier ?? taskId);
  }
  const lines = [...byAgent(runs)].map(([agentId, own]) => {
    const causes = [...new Set(own.map((run) => run.cause))]
      .map((cause) => `${cause} ${own.filter((run) => run.cause === cause).length}`)
      .join(", ");
    const tasks = [
      ...new Set(own.flatMap((run) => (run.taskId === null ? [] : [identifiers.get(run.taskId)]))),
    ];
    return `- ${names.get(agentId) ?? agentId}: ${own.length} (${causes})${tasks.length > 0 ? ` on ${tasks.join(", ")}` : ""}`;
  });
  const counting = record.since ?? "no failed run seen yet";
  return {
    content: [
      `Failed and timed-out runs since ${since.toISOString()}: ${runs.length}. Counting since ${counting}; runs that failed while the plugin was down are missing.`,
      ...lines,
    ].join("\n"),
    data: {
      countingSince: record.since,
      runs: runs.map((run) => ({
        ...run,
        task: run.taskId === null ? null : identifiers.get(run.taskId),
      })),
    },
  };
}

/** Registers `board_asks` and `failed_runs` as the manifest declares them. */
export function registerBoardTools(ctx: BoardToolsApi): void {
  const tools = { board_asks: boardAsks, failed_runs: failedRuns };
  for (const [name, answer] of Object.entries(tools)) {
    const declaration = manifest.tools?.find((tool) => tool.name === name);
    if (declaration === undefined) {
      throw new Error(`Agent tools: the manifest doesn't declare ${name}.`);
    }
    ctx.tools.register(name, declaration, async (params: unknown, runCtx: ToolRunContext) => {
      const since = readSince(params, new Date());
      let result: ToolResult;
      try {
        result =
          typeof since === "string"
            ? { error: `${name}: ${since}` }
            : await answer(ctx, runCtx.companyId, since);
      } catch (error) {
        result = {
          error: `${name}: couldn't read the board check's record (${errorCode(error)}).`,
        };
      }
      await writeMetrics(
        ctx,
        { "tools.calls": 1 },
        {
          companyId: runCtx.companyId,
          tool: name,
          outcome: result.error === undefined ? "ok" : "error",
        },
      );
      return result;
    });
  }
}
