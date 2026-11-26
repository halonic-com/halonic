import { type CopyChecks, needsCopyLines } from "./shadow-copies.ts";
import {
  lateAgrees,
  mergerOnlyReason,
  type NoteSeen,
  type PassView,
  type PullTrack,
  trackPulls,
} from "./shadow-reasons.ts";
import type { ActionCost, MergeAction } from "./state.ts";

/**
 * Shadow mode's comparison (ADR on HAL-17700): over one UTC day, what merge
 * control would have done against what the Merger did on GitHub. In shadow
 * mode nothing is written, so a pass decides the same enqueue again until
 * the Merger makes it; each action is kept once a day, at the first pass
 * that decided it. Each differing enqueue keeps why the other side didn't
 * make it (HAL-18345, `shadow-reasons.ts`). Pure: the job reads what the
 * Merger did and posts the text.
 */

/** A write the Merger made, as read from GitHub. */
export type ObservedAction =
  | {
      readonly kind: "enqueue";
      readonly number: number;
      readonly jump: boolean;
      readonly at: string;
    }
  | { readonly kind: "dequeue"; readonly number: number; readonly at: string }
  | {
      readonly kind: "comment";
      readonly number: number;
      readonly at: string;
      /** A queue-manager note on the pull request's current head: its kind and that head. */
      readonly note?: { readonly kind: string; readonly head: string };
    }
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
  /** Merge control's enqueues only: the head it decided on. */
  readonly head?: string;
  /** The Merger's enqueues only: why merge control didn't make it, when first seen. */
  readonly reason?: string;
}

/** One day's actions on both sides, by key. */
export interface ShadowDay {
  /** `YYYY-MM-DD`, UTC. */
  readonly day: string;
  readonly passes: number;
  readonly decided: Readonly<Record<string, ShadowEntry>>;
  readonly observed: Readonly<Record<string, ShadowEntry>>;
  /** Each open pull request's track, by number; carried into the next day. */
  readonly pulls?: Readonly<Record<string, PullTrack>>;
  /** The Merger's newest note per pull request and head, `<number>@<head>`. */
  readonly notes?: Readonly<Record<string, NoteSeen>>;
  /** The day's checks of the rule "needs a Paperclip copy with a full-SHA match" (HAL-19324). */
  readonly copies?: CopyChecks;
}

/** A new day with nothing in it. */
export function emptyShadowDay(now: Date): ShadowDay {
  return { day: now.toISOString().slice(0, 10), passes: 0, decided: {}, observed: {} };
}

/** The next day: nothing decided or seen yet, the pull requests' tracks and their notes kept. */
export function nextShadowDay(day: ShadowDay, now: Date): ShadowDay {
  const open = new Set(Object.keys(day.pulls ?? {}));
  const notes = Object.entries(day.notes ?? {}).filter(([key]) =>
    open.has(key.split("@")[0] ?? ""),
  );
  return {
    ...emptyShadowDay(now),
    ...(day.pulls === undefined ? {} : { pulls: day.pulls }),
    ...(day.notes === undefined ? {} : { notes: Object.fromEntries(notes) }),
  };
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
    // The Merger's close and reopen, and its added label, are read only as its comment.
    case "reopen":
    case "add-label":
      return [`comment #${action.number}`];
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
  const head = action.kind === "enqueue" && "head" in action ? { head: action.head } : {};
  const costly =
    (action.kind === "enqueue" || action.kind === "dequeue") &&
    "cost" in action &&
    !key.startsWith("comment");
  return { at, ...jump, ...head, ...(costly ? { cost: action.cost } : {}) };
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

/** The Merger's newest note per pull request and head, with this pass's notes. */
function notesWith(
  before: Readonly<Record<string, NoteSeen>> | undefined,
  observed: readonly ObservedAction[],
): Record<string, NoteSeen> {
  const notes = { ...before };
  for (const action of observed) {
    if (action.kind !== "comment" || action.note === undefined) {
      continue;
    }
    const key = `${action.number}@${action.note.head}`;
    if ((notes[key]?.at ?? "") < action.at) {
      notes[key] = { at: action.at, kind: action.note.kind };
    }
  }
  return notes;
}

/** Each Merger enqueue first seen this pass, with why merge control didn't make it. */
function withReasons(
  before: Readonly<Record<string, ShadowEntry>>,
  after: Record<string, ShadowEntry>,
  pulls: Readonly<Record<string, PullTrack>>,
): Record<string, ShadowEntry> {
  for (const [key, entry] of Object.entries(after)) {
    if (before[key] === undefined && key.startsWith("enqueue #")) {
      after[key] = { ...entry, reason: mergerOnlyReason(pulls[key.slice(9)], entry.at) };
    }
  }
  return after;
}

/**
 * The day with one more pass's decided actions and the Merger's writes seen
 * since; with the pass's view, also the pull requests' tracks and the reason
 * of each Merger enqueue.
 */
export function recordShadow(
  day: ShadowDay,
  decided: readonly MergeAction[],
  observed: readonly ObservedAction[],
  now: Date,
  view?: PassView,
): ShadowDay {
  const today = observed.filter((action) => action.at.startsWith(day.day));
  const seen = added(day.observed, today, (action) => (action as ObservedAction).at);
  const next = {
    ...day,
    passes: day.passes + 1,
    decided: added(day.decided, decided, () => now.toISOString()),
    notes: notesWith(day.notes, observed),
  };
  if (view === undefined) {
    return { ...next, observed: seen };
  }
  const pulls = trackPulls(day.pulls, view, now.toISOString());
  return { ...next, pulls, observed: withReasons(day.observed, seen, pulls) };
}

/** One line of the diff. */
export interface ShadowLine {
  readonly key: string;
  readonly at: string;
  readonly cost?: ActionCost;
  /** For a differing enqueue: `jump` on each side. */
  readonly jump?: { readonly controller: boolean; readonly merger: boolean };
  /** For an enqueue only one side made: why the other side didn't. */
  readonly reason?: string;
}

/** Where the two sides differ. */
export interface ShadowDiff {
  readonly day: string;
  readonly passes: number;
  readonly matched: number;
  readonly controllerOnly: readonly ShadowLine[];
  readonly mergerOnly: readonly ShadowLine[];
  /** The Merger's enqueues merge control's own rules passed within 5 minutes of: timing races. */
  readonly lateAgreed: readonly ShadowLine[];
  readonly differing: readonly ShadowLine[];
  /** What merge control's own jumps and dequeues would have cancelled that day. */
  readonly cost: ActionCost;
  /** The pull requests the rule "needs a Paperclip copy with a full-SHA match" would refuse; none is. */
  readonly needsCopy: readonly ShadowLine[];
}

const byTime = (a: ShadowLine, b: ShadowLine) => a.at.localeCompare(b.at);

function lineOf(key: string, entry: ShadowEntry): ShadowLine {
  return { key, at: entry.at, ...(entry.cost === undefined ? {} : { cost: entry.cost }) };
}

/** A merge-control-only enqueue's reason: the Merger's newest note on that head, or none. */
function noteReason(day: ShadowDay, key: string, entry: ShadowEntry): ShadowLine {
  const line = lineOf(key, entry);
  if (!key.startsWith("enqueue #") || entry.head === undefined) {
    return line;
  }
  const note = day.notes?.[`${key.slice(9)}@${entry.head}`];
  return { ...line, reason: note === undefined ? "no note" : `Merger's note: ${note.kind}` };
}

/** The day's diff. */
export function shadowDiff(day: ShadowDay): ShadowDiff {
  const controllerOnly: ShadowLine[] = [];
  const differing: ShadowLine[] = [];
  let matched = 0;
  for (const [key, mine] of Object.entries(day.decided)) {
    const theirs = day.observed[key];
    if (theirs === undefined) {
      controllerOnly.push(noteReason(day, key, mine));
    } else if (mine.jump !== undefined && mine.jump !== theirs.jump) {
      differing.push({
        ...lineOf(key, mine),
        jump: { controller: mine.jump, merger: theirs.jump === true },
      });
    } else {
      matched += 1;
    }
  }
  const theirsOnly = Object.entries(day.observed)
    .filter(([key]) => day.decided[key] === undefined)
    .map(([key, theirs]): ShadowLine => {
      const reason = theirs.reason === undefined ? {} : { reason: theirs.reason };
      return { key, at: theirs.at, ...reason };
    });
  const mergerOnly = theirsOnly.filter((line) => line.reason !== lateAgrees);
  const lateAgreed = theirsOnly.filter((line) => line.reason === lateAgrees);
  const costs = Object.values(day.decided).flatMap((entry) => entry.cost ?? []);
  return {
    day: day.day,
    passes: day.passes,
    matched,
    controllerOnly: controllerOnly.sort(byTime),
    mergerOnly: mergerOnly.sort(byTime),
    lateAgreed: lateAgreed.sort(byTime),
    differing: differing.sort(byTime),
    needsCopy: needsCopyLines(day.copies).sort(byTime),
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

function lines(title: string, items: readonly ShadowLine[], side = ""): string[] {
  if (items.length === 0) {
    return [];
  }
  const list = items.map((item) => {
    const jump =
      item.jump === undefined
        ? ""
        : ` (merge control: ${item.jump.controller ? "jump" : "no jump"}, Merger: ${item.jump.merger ? "jump" : "no jump"})`;
    const reason =
      item.reason === undefined || item.reason === lateAgrees ? "" : ` (${side}${item.reason})`;
    return `- ${item.at.slice(11, 16)} ${item.key}${jump}${costText(item.cost)}${reason}`;
  });
  return ["", `**${title}** (${items.length})`, ...list];
}

/**
 * The daily comment, Markdown: numbers, keys, times and reasons, no GitHub
 * text. A reason is merge control's own gate or wait text, or the kind of
 * the Merger's note, never the note itself.
 */
export function shadowDiffText(diff: ShadowDiff): string {
  return [
    `Merge control shadow diff for ${diff.day} (UTC): ${diff.passes} passes, ${diff.matched} actions the same, ${diff.differing.length} different, ${diff.controllerOnly.length} only merge control, ${diff.mergerOnly.length} only the Merger, ${diff.lateAgreed.length} late, agrees.`,
    `Merge control's jumps and dequeues would have cancelled ${diff.cost.groupsCancelled} merge groups, ${diff.cost.runnerMinutes} runner-minutes.`,
    ...lines("Different", diff.differing),
    ...lines("Only merge control would have done", diff.controllerOnly),
    ...lines("Only the Merger did", diff.mergerOnly, "merge control: "),
    ...lines("Late, agrees: merge control's rules passed within 5 minutes", diff.lateAgreed),
    ...lines(
      "Needs a Paperclip copy with a full-SHA match: would refuse, nothing refused",
      diff.needsCopy,
    ),
  ].join("\n");
}
