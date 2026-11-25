import { type GateRow, gateRow, withSizeHolds } from "./gate.ts";
import type { MergeSnapshot } from "./snapshot.ts";
import type { Decision, LogLine, MergeSettings } from "./state.ts";

/**
 * Why the two sides of the shadow diff differ (HAL-18345): each pass, merge
 * control's gate and wait reasons for every open pull request, and the kind
 * of the Merger's notes. A Merger enqueue that merge control's gate and wait
 * rules passed within 5 minutes of is a timing race, "late, agrees", not a
 * real miss. Pure: the job hands in the pass's snapshot and decision.
 */

/** The reason a Merger enqueue gets when merge control agreed within the window. */
export const lateAgrees = "late, agrees";

/** How close merge control's own pass must be to the Merger's enqueue to agree. */
const agreeWindowMs = 5 * 60_000;

/** One pull request as one pass saw it; no reasons: its gate and wait rules passed. */
export interface PullSeen {
  readonly head: string;
  readonly queued: boolean;
  readonly reasons: readonly string[];
}

/** One pass's view, by pull request number. */
export type PassView = Readonly<Record<string, PullSeen>>;

/** What the shadow keeps of a pull request between passes, for its current head. */
export interface PullTrack {
  readonly head: string;
  /** The newest pass that saw it out of the queue on this head, and its reasons then. */
  readonly outside?: { readonly at: string; readonly reasons: readonly string[] };
  /** The first pass on this head whose gate and wait rules passed. */
  readonly passedAt?: string;
}

/** The Merger's newest note on one head. */
export interface NoteSeen {
  readonly at: string;
  readonly kind: string;
}

const notAdded = "not added this pass: the queue at its target, a fill pause or a main-red freeze";

const notCandidate =
  "not a candidate: no built-on:paperclip label, or built-on:halonic without a verified fast-track";

/**
 * Each candidate's wait reason, from the fill's `waiting=#n(why) …` log
 * line; a reason may hold parentheses itself, so they are counted.
 */
export function waitsOf(log: readonly LogLine[]): Map<number, string> {
  const waits = new Map<number, string>();
  for (const line of log) {
    if (line.rule === "fill" && line.text.startsWith("waiting=")) {
      addWaits(line.text.slice("waiting=".length), waits);
    }
  }
  return waits;
}

function addWaits(text: string, waits: Map<number, string>): void {
  let rest = text;
  let match = /^#(\d+)\(/.exec(rest);
  while (match !== null) {
    let end = match[0].length;
    let depth = 1;
    while (end < rest.length && depth > 0) {
      if (rest[end] === "(") {
        depth += 1;
      } else if (rest[end] === ")") {
        depth -= 1;
      }
      end += 1;
    }
    waits.set(Number(match[1]), rest.slice(match[0].length, end - 1));
    rest = rest.slice(end).trimStart();
    match = /^#(\d+)\(/.exec(rest);
  }
}

function reasonsOf(row: GateRow, added: ReadonlySet<number>, waits: Map<number, string>): string[] {
  if (added.has(row.pull.number)) {
    return [];
  }
  const reasons = [...(row.pull.draft ? ["draft"] : []), ...row.reasons];
  if (reasons.length === 0 && row.pull.mergeable !== "MERGEABLE") {
    reasons.push(`mergeable ${row.pull.mergeable.toLowerCase()} on GitHub`);
  }
  if (!row.candidate) {
    reasons.push(notCandidate);
  }
  if (row.entry !== undefined || reasons.length > 0) {
    return reasons;
  }
  return [waits.get(row.pull.number) ?? notAdded];
}

/**
 * One pass's view: the gate's reasons, then a candidate's wait reason; a
 * pull request the pass enqueued has none. A queued one gets the gate only,
 * as the wait rules apply to candidates out of the queue.
 */
export function passView(
  snapshot: MergeSnapshot,
  decision: Decision,
  settings: MergeSettings,
): PassView {
  const rows = withSizeHolds(
    snapshot.pulls.map((pull) => gateRow(snapshot, pull, settings)),
    snapshot,
    settings.fileSizeLimit,
  );
  const added = new Set(
    decision.actions.flatMap((action) => (action.kind === "enqueue" ? [action.number] : [])),
  );
  const waits = waitsOf(decision.log);
  const view: Record<string, PullSeen> = {};
  for (const row of rows) {
    view[String(row.pull.number)] = {
      head: row.pull.head,
      queued: row.entry !== undefined,
      reasons: reasonsOf(row, added, waits),
    };
  }
  return view;
}

/**
 * The tracks after one more pass: only the open pull requests it saw, each
 * starting over when its head changed.
 */
export function trackPulls(
  before: Readonly<Record<string, PullTrack>> | undefined,
  view: PassView,
  at: string,
): Record<string, PullTrack> {
  const tracks: Record<string, PullTrack> = {};
  for (const [key, seen] of Object.entries(view)) {
    const old = before?.[key]?.head === seen.head ? before[key] : undefined;
    const outside = seen.queued ? old?.outside : { at, reasons: seen.reasons };
    const passedAt = old?.passedAt ?? (seen.reasons.length === 0 ? at : undefined);
    tracks[key] = {
      head: seen.head,
      ...(outside === undefined ? {} : { outside }),
      ...(passedAt === undefined ? {} : { passedAt }),
    };
  }
  return tracks;
}

/**
 * Why merge control didn't make an enqueue the Merger made at `at`: "late,
 * agrees" when its gate and wait rules passed within 5 minutes of it, else
 * its reasons on the newest pass that saw the pull request out of the queue
 * on this head.
 */
export function mergerOnlyReason(track: PullTrack | undefined, at: string): string {
  if (track === undefined) {
    return "not seen by merge control";
  }
  const passed = track.passedAt;
  if (passed !== undefined && Math.abs(Date.parse(passed) - Date.parse(at)) <= agreeWindowMs) {
    return lateAgrees;
  }
  if (track.outside === undefined) {
    return "not seen out of the queue on this head";
  }
  if (track.outside.reasons.length === 0) {
    return `gate and wait passed at ${track.outside.at.slice(11, 16)}`;
  }
  return track.outside.reasons.join("; ");
}

/** The Merger's queue-manager notes (`texts.ts`), by a pattern each. */
const noteKinds: readonly (readonly [RegExp, string])[] = [
  [/shows this PR as blocked/, "blocked"],
  [/clean and green but not queued/, "waiting for approval"],
  [/would be \d+ lines/, "file size"],
  [/live cloud suites/, "live cloud"],
  [/merge group failed/, "removed: its merge group failed"],
  [/held out by the board/, "removed: board hold"],
  [/re-adds it once Liam approves/, "removed: re-review"],
  [/^\*\*Removed from the merge queue\*\*/, "removed: gate"],
  [/only takes PRs from branches in this repository/, "branch outside the repository"],
  [/^Approval of \S+ carried to/, "approval carried"],
  [/^Runner wait/, "runner wait"],
];

/**
 * A Merger comment's kind when it is one of its queue-manager notes, else
 * undefined; the diff names the kind only, never the comment's text.
 */
export function noteKindOf(body: string): string | undefined {
  const known = noteKinds.find(([pattern]) => pattern.test(body));
  if (known !== undefined) {
    return known[1];
  }
  return body.startsWith("Queue manager:") ? "other queue-manager note" : undefined;
}
