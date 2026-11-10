// `list_runs` and `read_run`: the run history, read-only and condensed for a
// model. An agent gets them with `runLogs: true`. It sees only its own hub's
// runs, so one hub's agent never reads another hub's work.

import type { RunStatus, RunSummary } from "@halonicjs/events";
import type { Clock, RunStore } from "@halonicjs/ports";
import type { HalonicTool } from "../../agent/turn-tools.ts";
import { choiceArg, integerArg, optionalStringArg, requiredStringArg } from "../tool-args.ts";
import { runLines } from "./run-lines.ts";

/** What the run-log tools read, and whose runs they show. */
export interface RunLogToolsOptions {
  readonly runs: Pick<RunStore, "list" | "get" | "events">;
  readonly clock: Clock;
  /** The agent's hub; the tools see only its runs. */
  readonly hubId: string;
  /** The run the agent is in, which `list_runs` leaves out; absent outside a run. */
  readonly runId?: string;
}

/** What `list_runs` answers when no run matches. */
export const noRunsText = "No runs in that period.";
/** What `read_run` answers for a run that isn't there, or is in another hub. */
export const unknownRunText = "Unknown run.";
/** What `read_run` answers for a run with no events it shows. */
export const noEventsText = "No events yet.";

const statuses: readonly RunStatus[] = ["completed", "failed", "waiting", "running"];
const dayMs = 86_400_000;

/**
 * The run-log tools of an agent with `runLogs: true` (requirement
 * `engine.run-log-tools`): `list_runs` and `read_run`.
 *
 * @example
 * const tools = runLogTools({ runs, clock, hubId: "acme", runId: "r-7" });
 * tools.map((tool) => tool.definition.name); // ["list_runs", "read_run"]
 */
export function runLogTools(options: RunLogToolsOptions): HalonicTool[] {
  return [listRunsTool(options), readRunTool(options)];
}

function listRunsTool(options: RunLogToolsOptions): HalonicTool {
  return {
    definition: {
      name: "list_runs",
      description:
        "Lists earlier runs, newest first: id, workflow, trigger, status, start, duration, tokens, cost, error. Filter by days back, workflow or status.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "integer",
            minimum: 1,
            maximum: 90,
            description: "How many days back (default 7).",
          },
          workflow: { type: "string" },
          status: { type: "string", enum: statuses },
          limit: { type: "integer", minimum: 1, maximum: 200, description: "Default 50." },
        },
      },
    },
    run: async (args) => {
      const days = integerArg(args, "days", { min: 1, max: 90, fallback: 7 });
      const workflow = optionalStringArg(args, "workflow");
      const status = choiceArg(args, "status", statuses);
      const limit = integerArg(args, "limit", { min: 1, max: 200, fallback: 50 });
      const since = options.clock.now().getTime() - days * dayMs;
      const listed = await options.runs.list({
        hubId: options.hubId,
        kind: "run",
        ...(workflow === undefined ? {} : { workflowId: workflow }),
        ...(status === undefined ? {} : { status }),
      });
      const shown = listed
        .filter((run) => run.id !== options.runId && Date.parse(run.startedAt) >= since)
        .slice(0, limit);
      return shown.length === 0 ? noRunsText : shown.map(runListLine).join("\n");
    },
  };
}

function readRunTool(options: RunLogToolsOptions): HalonicTool {
  return {
    definition: {
      name: "read_run",
      description:
        "One run step by step: states, agents, model calls (tokens, cost, latency), tool calls with short results, approvals and errors. Long texts are cut.",
      parameters: {
        type: "object",
        properties: { runId: { type: "string" } },
        required: ["runId"],
      },
    },
    run: async (args) => {
      const runId = requiredStringArg(args, "runId");
      const summary = await options.runs.get(runId);
      if (summary === null || summary.hubId !== options.hubId) {
        return unknownRunText;
      }
      const lines = runLines(await options.runs.events(runId));
      return lines.length === 0 ? noEventsText : lines.join("\n");
    },
  };
}

/** One run as a line of `list_runs`, its fields joined with " | ". */
function runListLine(run: RunSummary): string {
  const seconds =
    run.endedAt === null
      ? null
      : Math.round((Date.parse(run.endedAt) - Date.parse(run.startedAt)) / 1000);
  const unpriced = run.unpricedCalls > 0 ? ` (+${run.unpricedCalls} unpriced)` : "";
  return [
    run.id,
    run.workflowId,
    run.trigger?.type ?? "manual",
    run.status,
    run.startedAt,
    seconds === null ? "-" : `${seconds}s`,
    `${run.usage.inputTokens}+${run.usage.outputTokens} tokens`,
    `cost ${run.cost.toFixed(4)}${unpriced}`,
    run.error ?? "",
  ].join(" | ");
}
