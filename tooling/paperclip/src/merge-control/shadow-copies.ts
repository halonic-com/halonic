import {
  type CopyReader,
  type CopyState,
  copyState,
  readCopySource,
} from "../pr-tools/approval-copy.ts";
import { reviewers } from "../pr-tools/approvals.ts";
import type { PassView, PullSeen } from "./shadow-reasons.ts";
import type { MergeSnapshot } from "./snapshot.ts";

/**
 * Shadow mode's check of the rule "needs a Paperclip copy with a full-SHA
 * match" (HAL-19324, phase 1 of HAL-19228): each pull request whose gate
 * passed, and whether Liam or Julian also posted their approval of its full
 * head on the task its branch names. Detection only: nothing is refused, the
 * daily diff lists the pull requests the rule would refuse.
 */

/** One pull request's check on its current head, kept for the day. */
export interface CopyCheck {
  readonly head: string;
  /** The first pass this day that checked this head. */
  readonly since: string;
  /** The newest check. */
  readonly checkedAt: string;
  readonly copy: CopyState;
}

/** The day's checks, by pull request number. */
export type CopyChecks = Readonly<Record<string, CopyCheck>>;

/**
 * A pull request without a copy is checked again after this long: the
 * reviewer posts the copy after the GitHub line, often a minute later.
 */
const recheckMs = 15 * 60_000;

/** The gate passed: no reasons, or only a wait rule held it back. */
function gatePassed(seen: PullSeen): boolean {
  return seen.reasons.length === 0 || seen.waiting === true;
}

/**
 * The pull requests to check this pass: the gate passed on a head not
 * checked yet today, or on one without a copy at its last check 15 minutes
 * ago or more. A branch that names no task stays `unknown`, so it isn't read again.
 */
export function copyChecksDue(view: PassView, before: CopyChecks | undefined, now: Date): number[] {
  return Object.entries(view).flatMap(([number, seen]) => {
    if (!gatePassed(seen)) {
      return [];
    }
    const check = before?.[number];
    const stale = check?.copy === "no" && now.getTime() - Date.parse(check.checkedAt) >= recheckMs;
    return check === undefined || check.head !== seen.head || stale ? [Number(number)] : [];
  });
}

/** Whether Liam or Julian posted the approval of the pull request's full head on its task. */
async function checkOne(
  snapshot: MergeSnapshot,
  number: number,
  reader: CopyReader,
): Promise<{ readonly head: string; readonly copy: CopyState } | undefined> {
  const pull = snapshot.pulls.find((each) => each.number === number);
  if (pull === undefined) {
    return undefined;
  }
  // A fork's branch can be named like ours, so it names no task.
  const source = await readCopySource(reader, pull.crossRepository ? undefined : pull.branch);
  const states = reviewers.map((by) => copyState({ by, head: pull.head }, source));
  const copy = states.includes("yes") ? "yes" : (states[0] ?? "unknown");
  return { head: pull.head, copy };
}

/**
 * The day's checks after this pass: the due pull requests read from Paperclip,
 * the others kept. A head checked before keeps the time it was first checked.
 */
export async function checkCopies(
  snapshot: MergeSnapshot,
  view: PassView,
  before: CopyChecks | undefined,
  reader: CopyReader,
  now: Date,
): Promise<CopyChecks> {
  const checks: Record<string, CopyCheck> = { ...before };
  const at = now.toISOString();
  for (const number of copyChecksDue(view, before, now)) {
    const checked = await checkOne(snapshot, number, reader);
    if (checked === undefined) {
      continue;
    }
    const earlier = checks[String(number)];
    const since = earlier?.head === checked.head ? earlier.since : at;
    checks[String(number)] = { ...checked, since, checkedAt: at };
  }
  return checks;
}

/** One line of the diff's list: a pull request the rule would refuse. */
export interface NeedsCopyLine {
  readonly key: string;
  readonly at: string;
  readonly reason: string;
}

/** The pull requests whose newest check found no copy, as the diff lists them. */
export function needsCopyLines(checks: CopyChecks | undefined): NeedsCopyLine[] {
  return Object.entries(checks ?? {})
    .filter(([, check]) => check.copy !== "yes")
    .map(([number, check]) => ({
      key: `#${number} on ${check.head.slice(0, 9)}`,
      at: check.since,
      reason: `copy: ${check.copy}`,
    }));
}
