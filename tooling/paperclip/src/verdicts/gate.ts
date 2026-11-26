import type { CopyAgent } from "../pr-tools/approval-copy.ts";
import type { AuthorComment } from "./author.ts";
import type { Hold, RecordedApproval, Verdicts } from "./reader.ts";
import type { VerdictStore } from "./store.ts";

/**
 * The approval gates on the recorded verdicts (HAL-19969, step 3 of 2.4 in
 * HAL-19228): what the merge gate and `pr_status` read instead of PR comments
 * once the board's flag (`verdictGate`) is on. It refuses where the Merger
 * does (Julian's minor 2 on HAL-19481):
 * - a changed-files list GitHub gave only part of counts as not approved, as
 *   a security path could hide among the files not listed;
 * - the author comes from `authorOf`, never from the branch name alone;
 * - any read that fails counts as not approved.
 * A plugin manifest change needs Julian's approval of the change too, as the
 * plugin deployer asks (HAL-19440). This part is pure, so `decide` can use it;
 * the reads are in `gate-read.ts`.
 */

/** What the gate needs about the pull request. */
export interface GateVerdictPull {
  readonly repo: string;
  readonly number: number;
  readonly head: string;
  readonly branch: string;
  /** The branch lives in the repository itself, not in a fork. */
  readonly ownBranch: boolean;
  /** The GitHub account that opened it; empty when GitHub didn't say. */
  readonly openedBy: string;
  /** How many files GitHub says it changes, and how many of them were read. */
  readonly filesTotal: number;
  readonly filesRead: number;
  /** The reviewer by the path rules, or undefined when the changed files weren't read. */
  readonly reviewer: "julian" | "liam" | undefined;
  /** Why Nora's approval can't count here (`routineRefusal`), or null when it can. */
  readonly routineRefusal: string | null;
  /** The head's fingerprint (`changeIdOf`), or null when it couldn't be worked out. */
  readonly fingerprint: string | null;
  /** The first changed file that builds a plugin manifest, if any. */
  readonly manifestFile: string | undefined;
}

/** Where the gate reads: the records, the task's comments and the company's agents. */
export interface RecordedSource {
  readonly store: VerdictStore;
  /** The account every agent pushes as (`halonic-dev`). */
  readonly teamLogin: string;
  /** The comments on the task with this identifier, or none when there is no such task. */
  taskComments(identifier: string): Promise<readonly AuthorComment[]>;
  agents(): Promise<readonly CopyAgent[]>;
}

/** What the records say for the gate. Not approved unless every read worked. */
export interface RecordedGate {
  readonly approved: boolean;
  /** Why it isn't approved, in the gate's words; empty when it is. */
  readonly reasons: readonly string[];
  readonly approvals: readonly RecordedApproval[];
  readonly holds: readonly Hold[];
  /** Julian recorded `security-ok` on exactly this head. */
  readonly securityOk: boolean;
  /** The author, as `authorOf` works it out. */
  readonly author?: string;
}

/** Not approved, for one reason, with nothing read. */
export function refusedGate(reason: string): RecordedGate {
  return { approved: false, reasons: [reason], approvals: [], holds: [], securityOk: false };
}

/** Why the records don't approve, or none when they do. */
function reasonsOf(verdicts: Verdicts, pull: GateVerdictPull, author: string): string[] {
  const h9 = pull.head.slice(0, 9);
  const reasons = verdicts.holds.map(
    (hold) => `changes requested by ${hold.by} (recorded on ${hold.head.slice(0, 9)})`,
  );
  const last = verdicts.approvals.at(-1);
  if (last === undefined) {
    reasons.push("no recorded approval");
  } else if (!verdicts.approvals.some((approval) => approval.counts)) {
    reasons.push(`no recorded approval counts on head ${h9}: ${last.note ?? "it doesn't count"}`);
  }
  if (pull.manifestFile !== undefined && (author === "julian" || !verdicts.julianOnChange)) {
    reasons.push(
      author === "julian"
        ? `Julian's own PR changes a plugin manifest (${pull.manifestFile}): for the board`
        : `changes a plugin manifest (${pull.manifestFile}): needs Julian's recorded approval on head ${h9} too`,
    );
  }
  return reasons;
}

/** What the records say, once the author is known. */
export function judgedGate(
  verdicts: Verdicts,
  pull: GateVerdictPull,
  author: string,
): RecordedGate {
  const reasons = reasonsOf(verdicts, pull, author);
  return {
    approved: reasons.length === 0 && verdicts.approved,
    reasons,
    approvals: verdicts.approvals,
    holds: verdicts.holds,
    securityOk: verdicts.securityOkOnHead,
    author,
  };
}
