// The Runs app's rows from each kind of source (HAL-18749): a workspace's
// workflow runs, in the Runs page's own row words, and a Paperclip team's
// agent runs. The list merges them (`services.all-runs`).

import { runStanding } from "@halonicjs/app";
import type { StatusChipTone } from "@halonicjs/studio-kit";
import type { SourcedRun } from "../api.ts";
import { toMinorUnits } from "../costs/cost-totals.ts";
import { type RunPhase, workflowRunPhase } from "../list/run-groups.ts";
import { currentStepName, enteredAStep, type RowContext, runRow } from "../list/run-row.ts";
import { startedByYou } from "../list/started-by-you.ts";
import { chipWords, lineSeparator } from "../run-words.ts";
import type { AppRun } from "./app-run.ts";

/** What a run notification says about a row besides its list words (`runs.run-notifications`). */
export interface RowNotice {
  /** Whether the user started it; a team's run never is, as Paperclip doesn't say who did. */
  readonly startedByMe: boolean;
  /** How long it ran, once it has ended. */
  readonly tookMs?: number;
  /** The step a workflow run failed in. */
  readonly failedStep?: string;
  /** The task an agent ran on, such as "ACME-7". */
  readonly task?: string;
}

/** A row of the Runs app, with the item its click opens: a workflow run's page; none yet for an agent's run. */
export interface AllRunsRow extends AppRun {
  readonly item?: { readonly kind: "run"; readonly hub: string; readonly id: string };
  readonly notice: RowNotice;
  /**
   * The runs table's Started by (`runs.runs-table`), in the Runs page's words, with the routine's
   * name for its tooltip; none for a team's run, as Paperclip doesn't say who started it.
   */
  readonly startedBy?: { readonly words: string; readonly tooltip?: string };
}

/**
 * The row of a workspace's run, or `undefined` for a test run, which stays
 * out of the Runs app as it does on the Runs page by default.
 *
 * @param where - the workspace's name
 */
export function workflowAppRun(
  run: SourcedRun,
  context: RowContext,
  where: string,
): AllRunsRow | undefined {
  const { summary } = run;
  if (summary.kind === "test") return undefined;
  const row = runRow(run, context);
  const phase = workflowRunPhase(runStanding(summary));
  return {
    id: summary.id,
    phase,
    startedAt: summary.startedAt,
    lineage: `${summary.hubId}/${summary.workflowId}`,
    cost:
      summary.cost > 0
        ? {
            kind: "money",
            currency: context.currency,
            minorUnits: toMinorUnits(summary.cost, context.currency),
          }
        : { kind: "none" },
    title: row.workflow,
    line: row.line,
    where,
    by: { kind: "workflow" },
    chip: { word: row.chip.word, tone: row.chip.tone },
    label: row.label,
    item: { kind: "run", hub: summary.hubId, id: summary.id },
    startedBy: {
      words: row.startedBy,
      ...(row.startedByTooltip === undefined ? {} : { tooltip: row.startedByTooltip }),
    },
    notice: {
      startedByMe: startedByYou(summary),
      ...tookOf(summary.startedAt, summary.endedAt ?? undefined),
      ...(phase === "failed" && enteredAStep(summary)
        ? { failedStep: currentStepName(summary, context.workflow) }
        : {}),
    },
  };
}

/** How long a run took, when it has ended and both times can be read. */
function tookOf(startedAt: string, endedAt: string | undefined): { tookMs?: number } {
  if (endedAt === undefined) return {};
  const tookMs = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isNaN(tookMs) ? {} : { tookMs };
}

/** Where a team agent's run is, as `ports.team-runs` says it. */
export type TeamRunState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed-out"
  | "interrupted";

/** The fields of a team agent's run (`ports.team-runs`) that its row needs. */
export interface TeamRunFields {
  readonly id: string;
  readonly agent: string;
  readonly task?: { readonly id: string; readonly identifier?: string; readonly title?: string };
  readonly state: TeamRunState;
  readonly startedAt?: string;
  readonly lastActivityAt?: string;
  readonly paid?: { readonly cents: number; readonly currency: string };
  readonly tokens?: { readonly input: number; readonly cached: number; readonly output: number };
}

/** The team words of a row (decided by the team on HAL-18749, from design revision 3). */
export const teamRowWords = {
  queued: "Queued",
  noTask: "Not on a task",
  unknownAgent: "An agent",
  title: (name: string, role: string | undefined) =>
    role === undefined ? name : `${name}${lineSeparator}${role}`,
  label: (chip: string, title: string, line: string, where: string) =>
    `${chip}, ${title}, ${line}, ${where}.`,
} as const;

const teamLooks: Readonly<
  Record<TeamRunState, { word: string; tone: StatusChipTone; phase: RunPhase }>
> = {
  queued: { word: teamRowWords.queued, tone: "neutral", phase: "running" },
  running: { word: chipWords.running, tone: "running", phase: "running" },
  succeeded: { word: chipWords.done, tone: "success", phase: "succeeded" },
  failed: { word: chipWords.failed, tone: "danger", phase: "failed" },
  "timed-out": { word: chipWords.failed, tone: "danger", phase: "failed" },
  // Stopped by someone, or by Paperclip itself (reassigned, restarted): nothing to act on.
  cancelled: { word: chipWords.cancelled, tone: "neutral", phase: "stopped" },
  interrupted: { word: chipWords.cancelled, tone: "neutral", phase: "stopped" },
};

/** What a team row needs besides the run. */
export interface TeamRowContext {
  /** The team's name, such as "Paperclip · Acme". */
  readonly where: string;
  /** The agent's name and role, when the team knows the agent. */
  readonly agent: { readonly name: string; readonly title?: string } | undefined;
  /** The team's answer time, for a queued run that hasn't started. */
  readonly asOf: string;
}

/** The row of a team agent's run: the agent with its role, the task it works on, and the team. */
export function teamAppRun(run: TeamRunFields, context: TeamRowContext): AllRunsRow {
  const look = teamLooks[run.state];
  const title =
    context.agent === undefined
      ? teamRowWords.unknownAgent
      : teamRowWords.title(context.agent.name, context.agent.title);
  const line = taskWords(run.task) ?? teamRowWords.noTask;
  return {
    id: run.id,
    phase: look.phase,
    startedAt: run.startedAt ?? run.lastActivityAt ?? context.asOf,
    // A later run on the same task that succeeds makes good an unopened failure.
    lineage: run.task?.id ?? run.id,
    cost: teamCost(run),
    title,
    line,
    where: context.where,
    by:
      context.agent === undefined
        ? { kind: "agent", name: teamRowWords.unknownAgent }
        : { kind: "agent", name: context.agent.name, id: run.agent },
    chip: { word: look.word, tone: look.tone },
    label: teamRowWords.label(look.word, title, line, context.where),
    notice: {
      startedByMe: false,
      // The team gives no end time: an ended run's last activity is when it ended.
      ...(look.phase === "running" || run.startedAt === undefined
        ? {}
        : tookOf(run.startedAt, run.lastActivityAt)),
      ...(run.task?.identifier === undefined ? {} : { task: run.task.identifier }),
    },
  };
}

/** "HAL-18533 Fix the login", or `undefined` when the run worked on no task or the team couldn't read it. */
function taskWords(task: TeamRunFields["task"]): string | undefined {
  if (task?.identifier === undefined) return undefined;
  return task.title === undefined ? task.identifier : `${task.identifier} ${task.title}`;
}

/** Money when the team priced the run, else its tokens for an agent on a subscription. */
function teamCost(run: TeamRunFields): AppRun["cost"] {
  if (run.paid !== undefined && run.paid.cents > 0) {
    return { kind: "money", currency: run.paid.currency, minorUnits: run.paid.cents };
  }
  const tokens =
    run.tokens === undefined ? 0 : run.tokens.input + run.tokens.cached + run.tokens.output;
  return tokens > 0 ? { kind: "tokens", tokens } : { kind: "none" };
}
