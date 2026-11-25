import type {
  PluginAgentsClient,
  PluginConfigClient,
  PluginIssuesClient,
  PluginStateClient,
  PluginToolsClient,
  ToolResult,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { amsterdamTime } from "../amsterdam-time.ts";
import { askLink, readSeenAsks, type SeenAsk } from "../board-check/asks.ts";
import { type FailedRun, readRecord } from "../board-check/failed-runs.ts";
import {
  keepHours,
  mergeSpeed,
  readMergeSpeedRecord,
  speedLines,
  staleMinutes,
  trendHours,
} from "../board-check/merge-speed.ts";
import { pileLine, readPiles } from "../board-check/piles.ts";
import { readBoardCheckSettings } from "../board-check/settings.ts";
import { readWaitingRecord, waitingLine } from "../board-check/waiting.ts";
import { loadSnapshot } from "../snapshot/store.ts";
import { errorCode, stateKey } from "./board-check-api.ts";
import { manifest } from "./manifest.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The board check's read tools: `board_asks`, `board_waiting`,
 * `failed_runs` and `merge_speed`. They read only what the board check and
 * the PR watcher kept in plugin state and a few task fields, so
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

/** `hours` as a whole number from 1 to a week, 6 when it's missing, or a message when it isn't. */
export function readHours(params: unknown): number | string {
  const { hours } = (params ?? {}) as { hours?: unknown };
  if (hours === undefined || hours === null) {
    return trendHours;
  }
  return typeof hours === "number" && Number.isInteger(hours) && hours >= 1 && hours <= keepHours
    ? hours
    : `hours must be a whole number from 1 to ${keepHours}.`;
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
      `- ${row.identifier}, comment ${row.commentId} by ${row.author} at ${amsterdamTime(row.createdAt)}: ${row.answered ? "answered" : "open"} (${row.link})`,
  );
  return {
    content: [
      `Board asks since ${amsterdamTime(since)}: ${rows.length}. No comment text: open the link to read one.`,
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
  const piles = readPiles(await ctx.state.get(stateKey(companyId, "piles")));
  const pileText = pileLine(piles.piles, names);
  return {
    content: [
      `Failed and timed-out runs since ${amsterdamTime(since)}: ${runs.length}. Counting since ${amsterdamTime(counting)}; runs that failed while the plugin was down are missing.`,
      ...lines,
      ...(pileText === undefined
        ? []
        : [
            `Queued piles at ${amsterdamTime(piles.at ?? "unknown time")}${piles.partial ? " (some tasks not read)" : ""}: ${pileText}.`,
          ]),
    ].join("\n"),
    data: {
      countingSince: record.since,
      piles: { at: piles.at, partial: piles.partial, piles: piles.piles },
      runs: runs.map((run) => ({
        ...run,
        task: run.taskId === null ? null : identifiers.get(run.taskId),
      })),
    },
  };
}

/** The ranked list from the board check's last hourly pass; it takes no `since`. */
async function boardWaiting(ctx: BoardToolsApi, companyId: string): Promise<ToolResult> {
  const record = readWaitingRecord(await ctx.state.get(stateKey(companyId, "waiting")));
  if (record === undefined) {
    return {
      content:
        "The board check hasn't listed what waits on the board yet; it does on the first pass of each hour.",
      data: null,
    };
  }
  const names = await agentNames(ctx, companyId);
  const lines = record.tasks.map((task, index) => `${index + 1}. ${waitingLine(task, names)}`);
  return {
    content: [
      `Waiting on the board as of ${record.at}: ${record.tasks.length} tasks, most held up first. No titles: open a task to read it.`,
      ...lines,
    ].join("\n"),
    data: record,
  };
}

/** Merge speed over the last `hours`, from the PR watcher's snapshot and the queue exits the board check kept. */
async function mergeSpeedTool(
  ctx: BoardToolsApi,
  companyId: string,
  hours: number,
): Promise<ToolResult> {
  const snapshot = await loadSnapshot(ctx, companyId);
  const record = readMergeSpeedRecord(await ctx.state.get(stateKey(companyId, "merge-speed")));
  if (snapshot === undefined || record === undefined) {
    return {
      error:
        "merge_speed: no figures yet; they start after the PR watcher's first snapshot and the board check's next pass.",
    };
  }
  const now = new Date();
  const speed = mergeSpeed(record, snapshot, hours, now);
  const stale = now.getTime() - Date.parse(snapshot.takenAt) > staleMinutes * 60_000;
  return {
    content: [
      `Merge speed, last ${hours} hours, from the snapshot of ${amsterdamTime(snapshot.takenAt)}${stale ? " (stale: older than 30 minutes)" : ""}:`,
      ...speedLines(speed),
      `Queue exits counted since ${amsterdamTime(record.trackingSince)}; earlier ones are missing.`,
    ].join("\n"),
    data: { ...speed, snapshotAt: snapshot.takenAt, stale, trackingSince: record.trackingSince },
  };
}

/** One tool: how it reads its parameters, and how it answers. */
interface BoardTool<P> {
  readonly read: (params: unknown) => P | string;
  readonly answer: (ctx: BoardToolsApi, companyId: string, param: P) => Promise<ToolResult>;
}

const tool = <P>(read: BoardTool<P>["read"], answer: BoardTool<P>["answer"]) =>
  ({ read, answer }) as BoardTool<unknown>;

/** Registers `board_asks`, `board_waiting`, `failed_runs` and `merge_speed` as the manifest declares them. */
export function registerBoardTools(ctx: BoardToolsApi): void {
  const since = (params: unknown) => readSince(params, new Date());
  const tools = {
    board_asks: tool(since, boardAsks),
    board_waiting: tool(since, boardWaiting),
    failed_runs: tool(since, failedRuns),
    merge_speed: tool(readHours, mergeSpeedTool),
  };
  for (const [name, { read, answer }] of Object.entries(tools)) {
    const declaration = manifest.tools?.find((tool) => tool.name === name);
    if (declaration === undefined) {
      throw new Error(`Agent tools: the manifest doesn't declare ${name}.`);
    }
    ctx.tools.register(name, declaration, async (params: unknown, runCtx: ToolRunContext) => {
      const param = read(params);
      let result: ToolResult;
      try {
        result =
          typeof param === "string"
            ? { error: `${name}: ${param}` }
            : await answer(ctx, runCtx.companyId, param);
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
