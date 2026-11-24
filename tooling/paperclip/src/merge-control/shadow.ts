import type { ActionCost, MergeAction } from "./state.ts";

/**
 * Shadow mode's comparison (ADR on HAL-17700): over one UTC day, what merge
 * control would have done against what the Merger did on GitHub. In shadow
 * mode nothing is written, so a pass decides the same enqueue again until
 * the Merger makes it; each action is kept once a day, at the first pass
 * that decided it. Pure: the job reads what the Merger did and posts the
 * text.
 */

/** A write the Merger made, as read from GitHub. */
export type ObservedAction =
  | {
      readonly kind: "enqueue";
      readonly number: number;
      readonly jump: boolean;
      readonly at: string;
    }
  | { readonly kind: "dequeue" | "comment"; readonly number: number; readonly at: string }
  | {
      readonly kind: "rerun" | "rerun-failed-jobs" | "cancel-run";
      readonly runId: number;
      readonly at: string;
    };

/** One action of a day, on either side. */
export interface ShadowEntry {
  /** The first time it was decided or seen. */
  readonly at: string;
  /** Enqueues only. */
  readonly jump?: boolean;
  /** Merge control's jumps and dequeues only. */
  readonly cost?: ActionCost;
}

/** One day's actions on both sides, by key. */
export interface ShadowDay {
  /** `YYYY-MM-DD`, UTC. */
  readonly day: string;
  readonly passes: number;
  readonly decided: Readonly<Record<string, ShadowEntry>>;
  readonly observed: Readonly<Record<string, ShadowEntry>>;
}

/** A new day with nothing in it. */
export function emptyShadowDay(now: Date): ShadowDay {
  return { day: now.toISOString().slice(0, 10), passes: 0, decided: {}, observed: {} };
}

/**
 * The keys an action is compared by: the queue actions and comments by pull
 * request, the CI actions by run. A dequeue also counts as a comment, as the
 * Merger posts one with each. `update-branch` and `wake` have no Merger
 * counterpart and aren't compared.
 */
function keysOf(action: MergeAction | ObservedAction): string[] {
  switch (action.kind) {
    case "enqueue":
    case "comment":
      return [`${action.kind} #${action.number}`];
    case "dequeue":
      return [`dequeue #${action.number}`, `comment #${action.number}`];
    case "rerun":
    case "rerun-failed-jobs":
    case "cancel-run":
      return [`${action.kind} run ${action.runId}`];
    case "update-branch":
    case "wake":
      return [];
  }
}

function entryOf(action: MergeAction | ObservedAction, at: string, key: string): ShadowEntry {
  const jump = action.kind === "enqueue" ? { jump: action.jump } : {};
  const costly =
    (action.kind === "enqueue" || action.kind === "dequeue") &&
    "cost" in action &&
    !key.startsWith("comment");
  return { at, ...jump, ...(costly ? { cost: action.cost } : {}) };
}

function added(
  into: Readonly<Record<string, ShadowEntry>>,
  actions: readonly (MergeAction | ObservedAction)[],
  at: (action: MergeAction | ObservedAction) => string,
): Record<string, ShadowEntry> {
  const result = { ...into };
  for (const action of actions) {
    for (const key of keysOf(action)) {
      result[key] ??= entryOf(action, at(action), key);
    }
  }
  return result;
}

/** The day with one more pass's decided actions and the Merger's writes seen since. */
export function recordShadow(
  day: ShadowDay,
  decided: readonly MergeAction[],
  observed: readonly ObservedAction[],
  now: Date,
): ShadowDay {
  const today = observed.filter((action) => action.at.startsWith(day.day));
  return {
    ...day,
    passes: day.passes + 1,
    decided: added(day.decided, decided, () => now.toISOString()),
    observed: added(day.observed, today, (action) => (action as ObservedAction).at),
  };
}

/** One line of the diff. */
export interface ShadowLine {
  readonly key: string;
  readonly at: string;
  readonly cost?: ActionCost;
  /** For a differing enqueue: `jump` on each side. */
  readonly jump?: { readonly controller: boolean; readonly merger: boolean };
}

/** Where the two sides differ. */
export interface ShadowDiff {
  readonly day: string;
  readonly passes: number;
  readonly matched: number;
  readonly controllerOnly: readonly ShadowLine[];
  readonly mergerOnly: readonly ShadowLine[];
  readonly differing: readonly ShadowLine[];
  /** What merge control's own jumps and dequeues would have cancelled that day. */
  readonly cost: ActionCost;
}

const byTime = (a: ShadowLine, b: ShadowLine) => a.at.localeCompare(b.at);

function lineOf(key: string, entry: ShadowEntry): ShadowLine {
  return { key, at: entry.at, ...(entry.cost === undefined ? {} : { cost: entry.cost }) };
}

/** The day's diff. */
export function shadowDiff(day: ShadowDay): ShadowDiff {
  const controllerOnly: ShadowLine[] = [];
  const differing: ShadowLine[] = [];
  let matched = 0;
  for (const [key, mine] of Object.entries(day.decided)) {
    const theirs = day.observed[key];
    if (theirs === undefined) {
      controllerOnly.push(lineOf(key, mine));
    } else if (mine.jump !== undefined && mine.jump !== theirs.jump) {
      differing.push({
        ...lineOf(key, mine),
        jump: { controller: mine.jump, merger: theirs.jump === true },
      });
    } else {
      matched += 1;
    }
  }
  const mergerOnly = Object.entries(day.observed)
    .filter(([key]) => day.decided[key] === undefined)
    .map(([key, theirs]) => ({ key, at: theirs.at }));
  const costs = Object.values(day.decided).flatMap((entry) => entry.cost ?? []);
  return {
    day: day.day,
    passes: day.passes,
    matched,
    controllerOnly: controllerOnly.sort(byTime),
    mergerOnly: mergerOnly.sort(byTime),
    differing: differing.sort(byTime),
    cost: {
      groupsCancelled: costs.reduce((sum, cost) => sum + cost.groupsCancelled, 0),
      runnerMinutes: costs.reduce((sum, cost) => sum + cost.runnerMinutes, 0),
    },
  };
}

function costText(cost: ActionCost | undefined): string {
  if (cost === undefined || cost.groupsCancelled === 0) {
    return "";
  }
  return ` (cancels ${cost.groupsCancelled} groups, ${cost.runnerMinutes} runner-minutes)`;
}

function lines(title: string, items: readonly ShadowLine[]): string[] {
  if (items.length === 0) {
    return [];
  }
  const list = items.map((item) => {
    const jump =
      item.jump === undefined
        ? ""
        : ` (merge control: ${item.jump.controller ? "jump" : "no jump"}, Merger: ${item.jump.merger ? "jump" : "no jump"})`;
    return `- ${item.at.slice(11, 16)} ${item.key}${jump}${costText(item.cost)}`;
  });
  return ["", `**${title}** (${items.length})`, ...list];
}

/** The daily comment, Markdown: numbers, keys and times only, no GitHub text. */
export function shadowDiffText(diff: ShadowDiff): string {
  return [
    `Merge control shadow diff for ${diff.day} (UTC): ${diff.passes} passes, ${diff.matched} actions the same, ${diff.differing.length} different, ${diff.controllerOnly.length} only merge control, ${diff.mergerOnly.length} only the Merger.`,
    `Merge control's jumps and dequeues would have cancelled ${diff.cost.groupsCancelled} merge groups, ${diff.cost.runnerMinutes} runner-minutes.`,
    ...lines("Different", diff.differing),
    ...lines("Only merge control would have done", diff.controllerOnly),
    ...lines("Only the Merger did", diff.mergerOnly),
  ].join("\n");
}
