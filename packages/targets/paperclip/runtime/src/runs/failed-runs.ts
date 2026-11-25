import type { Tool } from "@halonicjs/format";
import type { ActionCall, ActionHandler } from "../handlers.ts";
import type { ToolResult } from "../host.ts";
import { type FailedRun, failedRunsKey, readRecord } from "./failed-runs-record.ts";

/**
 * The `paperclip.failed-runs` action: the runs that failed or timed out, per
 * agent, with their tasks and cause codes, from the record the runtime keeps
 * (`failed-runs-record.ts`). Ported from `tooling/paperclip`'s `failed_runs`
 * (`plugin/board-tools.ts`), with the same parameter, refusal and answer;
 * the board check's queued piles aren't in the runtime, so that line is
 * left out. Answers carry ids, names, times and cause codes, never error text.
 */

/** The window the tool's settings give, in hours; 24 when they give none. */
function hoursOf(tool: Tool): number {
  const settings = tool.action.with;
  return "hours" in settings && typeof settings.hours === "number" ? settings.hours : 24;
}

/** `since` as a time, the tool's window back when it's missing, or a message when it isn't a time. */
export function readSince(params: unknown, now: Date, hours: number): Date | string {
  const { since } = (params ?? {}) as { since?: unknown };
  if (since === undefined || since === null || since === "") {
    return new Date(now.getTime() - hours * 60 * 60_000);
  }
  const time = typeof since === "string" ? Date.parse(since) : Number.NaN;
  return Number.isNaN(time)
    ? "since must be an ISO time, such as 2026-11-22T12:00:00Z."
    : new Date(time);
}

function byAgent(runs: readonly FailedRun[]): Map<string, FailedRun[]> {
  const groups = new Map<string, FailedRun[]>();
  for (const run of runs) {
    groups.set(run.agentId, [...(groups.get(run.agentId) ?? []), run]);
  }
  return groups;
}

/** Each task's identifier, such as HAL-16403; a task Paperclip doesn't give back keeps its id. */
async function identifiers(
  { paperclip, companyId }: ActionCall,
  runs: readonly FailedRun[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const taskId of new Set(runs.flatMap((run) => run.taskId ?? []))) {
    const issue = await paperclip.issues.get(taskId, companyId);
    found.set(taskId, issue?.identifier ?? taskId);
  }
  return found;
}

/** One line per agent: how many runs failed, by cause, and on which tasks. */
function agentLine(name: string, own: readonly FailedRun[], tasks: ReadonlyMap<string, string>) {
  const causes = [...new Set(own.map((run) => run.cause))]
    .map((cause) => `${cause} ${own.filter((run) => run.cause === cause).length}`)
    .join(", ");
  const onTasks = [
    ...new Set(own.flatMap((run) => (run.taskId === null ? [] : [tasks.get(run.taskId)]))),
  ];
  return `- ${name}: ${own.length} (${causes})${onTasks.length > 0 ? ` on ${onTasks.join(", ")}` : ""}`;
}

async function failedRunsAnswer(call: ActionCall, since: Date): Promise<ToolResult> {
  const { paperclip, companyId } = call;
  const record = readRecord(await paperclip.state.get(failedRunsKey(companyId)));
  const runs = record.runs.filter((run) => Date.parse(run.at) >= since.getTime());
  const agents = await paperclip.agents.list({ companyId, limit: 500 });
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  const tasks = await identifiers(call, runs);
  const lines = [...byAgent(runs)].map(([agentId, own]) =>
    agentLine(names.get(agentId) ?? agentId, own, tasks),
  );
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
        task: run.taskId === null ? null : tasks.get(run.taskId),
      })),
    },
  };
}

/** Lists the failed runs since a time. A `since` that isn't a time goes back before anything is read. */
export const failedRunsHandler: ActionHandler = {
  // The runtime keeps the record from `agent.run.failed` events; the answer names each run's task.
  capabilities: ["events.subscribe", "issues.read", "agents.read"],
  run: async (call) => {
    const { tool } = call;
    if (tool.action.run !== "paperclip.failed-runs") {
      return { error: `${tool.name}: runs ${tool.action.run}, not paperclip.failed-runs.` };
    }
    const since = readSince(call.params, call.now, hoursOf(tool));
    if (typeof since === "string") {
      return { error: `${tool.name}: ${since}` };
    }
    try {
      return await failedRunsAnswer(call, since);
    } catch (error) {
      return {
        error: `${tool.name}: couldn't read the failed runs (${(error as Error).message}).`,
      };
    }
  },
};
