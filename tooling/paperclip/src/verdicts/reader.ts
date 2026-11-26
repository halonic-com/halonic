import {
  type Approval,
  type ApprovedPull,
  judgeApprovals,
  reviewers,
} from "../pr-tools/approvals.ts";
import { reviewerName, type VerdictRecord } from "./record.ts";
import type { VerdictStore } from "./store.ts";

/**
 * The one reader of recorded verdicts, `verdictsFor` (HAL-19481, 2.2 of
 * HAL-19228). It decides what the records say about a pull request's
 * current head:
 * - An approval counts on the head it names, by its full SHA, or on a later
 *   head with the same change: the fingerprint of the whole diff against its
 *   merge base (`changeIdOf`) matches the one recorded with it. A head without
 *   a fingerprint needs a new approval. Whether it counts then follows the
 *   HAL-14809 rules on the current head (`judgeApprovals`).
 * - A change request holds the pull request at every head until the same
 *   reviewer records an approval or `withdrawn`.
 * - Julian's `security-ok` counts only on the exact head it names.
 * The gates read it through `recordedGateOf` once the board's flag is on (2.4).
 */

/** What deciding needs about the pull request: the approval rules' facts and the head's fingerprint. */
export interface VerdictPull extends Omit<ApprovedPull, "rebaseRefusal" | "routineRefusal"> {
  /**
   * Why Nora's approval can't count here (`routineRefusal`), or null when it
   * can. Required: unread files would let her approval count anywhere.
   */
  readonly routineRefusal: string | null;
  /** The current head's fingerprint (`changeIdOf`), or null when GitHub couldn't give one. */
  readonly fingerprint: string | null;
}

/** A recorded approval, judged on the current head. */
export interface RecordedApproval extends Approval {
  readonly record: string;
  /** The head the reviewer approved, when it counts on a later head with the same change. */
  readonly carriedFrom?: string;
}

/** A change request that still holds the pull request. */
export interface Hold {
  readonly by: string;
  readonly head: string;
  readonly at: string;
  readonly record: string;
}

/** What the records say about the current head. */
export interface Verdicts {
  readonly approvals: readonly RecordedApproval[];
  readonly holds: readonly Hold[];
  /** Julian recorded `security-ok` on exactly this head. */
  readonly securityOkOnHead: boolean;
  /** Julian approved this head's change, within his limits or not: a plugin manifest change needs it. */
  readonly julianOnChange: boolean;
  /** An approval counts and no change request holds it. */
  readonly approved: boolean;
}

/** The verdicts, or why they couldn't be read: then nothing counts as approved. */
export type VerdictsRead =
  | { readonly state: "read"; readonly verdicts: Verdicts }
  | { readonly state: "unknown"; readonly reason: string };

/** Whether an approval of `record` applies to the current head: the same head, or the same change. */
function sameChange(record: VerdictRecord, pull: VerdictPull): boolean {
  return (
    record.head === pull.head ||
    (record.fingerprint !== null && record.fingerprint === pull.fingerprint)
  );
}

function judgedApproval(record: VerdictRecord, pull: VerdictPull): RecordedApproval {
  const by = reviewerName(record.reviewer);
  if (!reviewers.includes(by)) {
    return { by, head: record.head, counts: false, note: "not a reviewer", record: record.id };
  }
  if (!sameChange(record, pull)) {
    return {
      by,
      head: record.head,
      counts: false,
      note: "names an older head with other changes",
      record: record.id,
    };
  }
  // No rebase-only re-approvals here: the fingerprint carries an approval over a rebase.
  const [judged] = judgeApprovals([{ by, head: pull.head }], pull);
  const carried = record.head === pull.head ? {} : { carriedFrom: record.head };
  return { ...(judged as Approval), ...carried, record: record.id };
}

/** Each reviewer's change request that no later approval or `withdrawn` of theirs cleared. */
function holdsOf(records: readonly VerdictRecord[]): Hold[] {
  const open = new Map<string, Hold>();
  for (const record of records) {
    if (record.verdict === "changes-requested") {
      const by = reviewerName(record.reviewer);
      open.set(record.reviewer, { by, head: record.head, at: record.at, record: record.id });
    } else if (record.verdict === "approved" || record.verdict === "withdrawn") {
      open.delete(record.reviewer);
    }
  }
  return [...open.values()];
}

/** What the records, oldest first, say about the pull request's current head. */
export function judgeVerdicts(records: readonly VerdictRecord[], pull: VerdictPull): Verdicts {
  const approvals = records
    .filter((record) => record.verdict === "approved")
    .map((record) => judgedApproval(record, pull));
  const holds = holdsOf(records);
  const securityOkOnHead = records.some(
    (record) =>
      record.verdict === "security-ok" && record.reviewer === "julian" && record.head === pull.head,
  );
  const julianOnChange = records.some(
    (record) =>
      record.verdict === "approved" && record.reviewer === "julian" && sameChange(record, pull),
  );
  const approved = holds.length === 0 && approvals.some((approval) => approval.counts);
  return { approvals, holds, securityOkOnHead, julianOnChange, approved };
}

/** The pull request's verdicts from the store; a read that fails gives `unknown`, never approved. */
export async function verdictsFor(
  store: VerdictStore,
  repo: string,
  pr: number,
  pull: VerdictPull,
): Promise<VerdictsRead> {
  try {
    return { state: "read", verdicts: judgeVerdicts(await store.list(repo, pr), pull) };
  } catch (error) {
    return {
      state: "unknown",
      reason: `the verdicts couldn't be read: ${(error as Error).message}`,
    };
  }
}
