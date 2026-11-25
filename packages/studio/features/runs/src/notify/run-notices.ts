// Which ended runs raise a notification, and its words (design HAL-18594
// revision 3, section 2, Notifications). Pure: two readings and the user's
// switches come in, so a test and a laptop give the same answer.

import type { AgentNotice } from "@halonicjs/studio-services";
import { rowCostWords } from "../app/app-run.ts";
import type { RunCost } from "../costs/cost-totals.ts";
import type { RunPhase } from "../list/run-groups.ts";
import { lineSeparator } from "../run-words.ts";
import { tookWords } from "../time-words.ts";

/** One run as the notifications need it, from any source. */
export interface NotifiableRun {
  /** The run's id, unique across sources. */
  readonly id: string;
  readonly phase: RunPhase;
  /** A workflow's run, or an agent's run in a Paperclip team. */
  readonly kind: "workflow" | "agent";
  /** The workflow's name, or the agent's name. */
  readonly name: string;
  /** Where it runs: the workspace, or "Paperclip · Acme". */
  readonly where: string;
  /** When the run started; ISO 8601. */
  readonly startedAt: string;
  /** How long it ran, once it has ended. */
  readonly tookMs?: number;
  /** Whether the user started it, with Run, Run now, the Inbox or Run again. */
  readonly startedByMe: boolean;
  /** The step a workflow run failed in. */
  readonly failedStep?: string;
  /** The task an agent ran on, such as "HAL-18533". */
  readonly task?: string;
  readonly cost: RunCost;
}

/** The three switches under Settings › Notifications › Runs. */
export interface RunNotificationSettings {
  /** "When a run fails". */
  readonly failed: boolean;
  /** "When a run I started finishes". */
  readonly startedByMeFinished: boolean;
  /** "When any run finishes". */
  readonly anyFinished: boolean;
}

/** The design's defaults: every failure and the runs you started, not every finished run. */
export const defaultRunNotificationSettings: RunNotificationSettings = {
  failed: true,
  startedByMeFinished: true,
  anyFinished: false,
};

/** The switches' labels, in the design's words. */
export const runNotificationSettingWords = {
  heading: "Runs",
  failed: "When a run fails",
  startedByMeFinished: "When a run I started finishes",
  anyFinished: "When any run finishes",
} as const;

/** The two readings a change is found between. */
export interface RunReadings {
  readonly before: readonly NotifiableRun[];
  readonly after: readonly NotifiableRun[];
  /** When `before` was read: a run not in it counts only if it started since. */
  readonly since: Date;
}

/**
 * The runs that failed or finished between the two readings and that the
 * switches let through, in the order of `after`. A run already ended in
 * `before`, a stopped run, and a run that only shows up now but started before
 * `since` (a workspace connected again) give nothing.
 */
export function endedRuns(
  readings: RunReadings,
  settings: RunNotificationSettings,
): NotifiableRun[] {
  const before = new Map(readings.before.map((run) => [run.id, run.phase]));
  return readings.after.filter((run) => {
    const earlier = before.get(run.id);
    if (earlier === undefined && Date.parse(run.startedAt) < readings.since.getTime()) {
      return false;
    }
    if (earlier !== undefined && hasEnded(earlier)) {
      return false;
    }
    return notifies(run, settings);
  });
}

function hasEnded(phase: RunPhase): boolean {
  return phase === "failed" || phase === "succeeded" || phase === "stopped";
}

function notifies(run: NotifiableRun, settings: RunNotificationSettings): boolean {
  if (run.phase === "failed") {
    return settings.failed;
  }
  if (run.phase === "succeeded") {
    return settings.anyFinished || (settings.startedByMeFinished && run.startedByMe);
  }
  return false;
}

/** One run's notification; a click opens Runs on that run. */
export function runNotice(run: NotifiableRun): AgentNotice {
  return {
    reason: "run",
    title: runTitle(run),
    body: runBody(run),
    target: { kind: "run", id: run.id },
  };
}

/** Several failures as one notification; a click opens Runs on the Failed group. */
export function failedRunsNotice(runs: readonly NotifiableRun[]): AgentNotice {
  const places = [...new Set(runs.map((run) => run.where))];
  return {
    reason: "run",
    title: `${runs.length} runs failed`,
    body: places.join(", "),
    target: { kind: "runs-failed", id: "failed" },
  };
}

function runTitle(run: NotifiableRun): string {
  if (run.phase === "succeeded") {
    return `${run.name} finished`;
  }
  return run.kind === "agent" ? `${run.name}'s run stopped with an error` : `${run.name} failed`;
}

function runBody(run: NotifiableRun): string {
  const parts = [run.where];
  if (run.phase === "succeeded") {
    if (run.tookMs !== undefined) {
      parts.push(`took ${tookWords(run.tookMs)}`);
    }
    const cost = rowCostWords(run.cost, false);
    if (cost !== undefined) {
      parts.push(cost);
    }
  } else if (run.kind === "agent" && run.task !== undefined) {
    parts.push(run.task);
  } else if (run.kind === "workflow" && run.failedStep !== undefined) {
    parts.push(`in the step ${run.failedStep}`);
  }
  return parts.join(lineSeparator);
}
