import { fastTrackLabel } from "../pr-tools/queue-state.ts";
import type { ApprovalVerdict } from "./approval.ts";
import { commentSide, recordedSide } from "./approval-side.ts";
import type { ChangeRequest } from "./change-request.ts";
import { type CiOk, ciOkOf, requiredWorkflowProblems } from "./checks.ts";
import { isBuiltOn } from "./facts-pulls.ts";
import type { GatePull, MergeSnapshot, QueueEntry } from "./snapshot.ts";
import type { MergeSettings } from "./state.ts";

/**
 * The gate (MERGER.md §4): every rule a pull request must pass before it is
 * queued, and the facts the removal and fill rules read from it.
 */

/** One pull request's gate verdict. */
export interface GateRow {
  readonly pull: GatePull;
  readonly entry: QueueEntry | undefined;
  readonly approval: ApprovalVerdict | null;
  readonly noApproval: boolean;
  readonly reReview: boolean;
  /** With the board's flag on, the recorded verdicts couldn't be read: it isn't added, and isn't removed for that. */
  readonly verdictsUnread: boolean;
  readonly changeRequest: ChangeRequest | null;
  readonly ci: CiOk;
  readonly foreign: boolean;
  /** Labelled `built-on:paperclip` or `built-on:halonic` (HAL-18470); the flake reruns read it. */
  readonly paperclip: boolean;
  /** One the fill may add: labelled like `paperclip`. */
  readonly candidate: boolean;
  readonly reasons: readonly string[];
  readonly pass: boolean;
  /** Set by the file-size rule when the pull request would push a file over the limit. */
  readonly sizeHold?: SizeHold;
}

/** A file that would grow past the limit on top of `main` and the queue. */
export interface SizeHold {
  readonly file: string;
  readonly main: number;
  readonly net: number;
  readonly ahead: readonly { readonly n: number; readonly net: number }[];
  readonly total: number;
}

/** `fast-track` was added by a labeller from the settings; an unknown one never counts. */
export function fastTrackVerified(pull: GatePull, settings: MergeSettings): boolean {
  const by = pull.fastTrackBy;
  return (
    pull.labels.includes(fastTrackLabel) && by !== null && settings.fastTrackLabellers.includes(by)
  );
}

/** Release bases, as the live Merger names them (`gate.js`, 26 Nov 09:11 UTC). */
const releaseBase = /^(release|changeset-release|hotfix)\//;

/**
 * Why a pull request on another base waits, in the live Merger's words
 * (HAL-19779). A release base never reaches `main` by itself (#6416,
 * HAL-19508). A base that is an open pull request's branch is a stack: it
 * queues once that one merges. Any other base, or one with the open list
 * unread (a replayed pass), counts as a stack too.
 */
function baseReason(base: string): string {
  if (releaseBase.test(base)) {
    return `targets ${base}, not main (a release branch): retarget it to main, or the release captain merges it into the release branch`;
  }
  return `targets ${base}, not main (stacked PR): it queues once its base merges and it is retargeted`;
}

/** The gate for one pull request. */
export function gateRow(snapshot: MergeSnapshot, pull: GatePull, settings: MergeSettings): GateRow {
  const h9 = pull.head.slice(0, 9);
  // The board's flag decides where approvals come from (HAL-19969).
  const side = settings.verdictGate
    ? recordedSide(snapshot, pull)
    : commentSide(snapshot, pull, settings.teamLogin);
  const reasons = [...side.reasons];
  const ci = ciOkOf(pull);
  if (ci.state !== "success") {
    const why = ci.state === "label-noop" && ci.why !== undefined ? `: ${ci.why}` : "";
    reasons.push(`ci-ok ${ci.state} on head ${h9}${why}`);
  }
  for (const problem of requiredWorkflowProblems(pull)) {
    reasons.push(`required workflow ${problem} on head ${h9}`);
  }
  const foreign = pull.crossRepository || pull.headOwner !== settings.owner;
  if (foreign) {
    reasons.push(
      `head branch is not in ${settings.owner}'s repository: the merge queue only takes PRs from branches in this repository`,
    );
  }
  if (pull.base !== "main") {
    reasons.push(baseReason(pull.base));
  }
  if (pull.mergeable === "CONFLICTING") {
    reasons.push("conflicts with main: please rebase");
  }
  return {
    pull,
    entry: snapshot.queue.find((entry) => entry.number === pull.number),
    approval: side.approval,
    noApproval: side.approval?.ok !== true,
    reReview: side.reReview,
    verdictsUnread: side.unread,
    changeRequest: side.changeRequest,
    ci,
    foreign,
    paperclip: isBuiltOn(pull.labels),
    candidate: isBuiltOn(pull.labels),
    reasons,
    pass: reasons.length === 0 && pull.mergeable === "MERGEABLE",
  };
}

/** Files the repo's file-size rule measures (`tooling/check/src/rules/file-size.ts`). */
export function measuredFile(path: string): boolean {
  return (
    /\.(?:[cm]?[jt]sx?|css|rs|astro)$/.test(path) &&
    !/(?:^|\/)(?:generated|fixtures|__fixtures__|golden)\//.test(path) &&
    !/\.generated\.[a-z]+$/.test(path)
  );
}

/** A file's line count on `main`, and whether it only re-exports (no limit, HAL-14368). */
export function mainFileOf(text: string): { readonly lines: number; readonly barrel: boolean } {
  const all = text.split("\n");
  const lines = text.endsWith("\n") ? all.length - 1 : all.length;
  const barrel = all
    .filter((line) => line.trim() !== "" && !/^\s*(\/\/|\/\*|\*)/.test(line))
    .every(
      (line) =>
        /^\s*export\s.*\sfrom\s/.test(line) ||
        /^\s*export\s*\*/.test(line) ||
        /^\s*[}\w,\s]*$/.test(line),
    );
  return { lines, barrel };
}

/**
 * The file-size pre-check (board, 21 Nov 22:50): each file a ready pull
 * request grows, measured as `main` plus every queued pull request's net
 * change plus this one's, must stay within the limit, or its merge group
 * would fail.
 */
export function withSizeHolds(
  rows: readonly GateRow[],
  snapshot: MergeSnapshot,
  limit: number,
): GateRow[] {
  const queued = rows.filter((row) => row.entry !== undefined);
  return rows.map((row) => {
    if (row.entry !== undefined || !row.pass) {
      return row;
    }
    for (const [file, net] of Object.entries(row.pull.fileNet)) {
      const main = snapshot.mainFiles[file] ?? { lines: 0, barrel: false };
      // A file already over the limit on main is exempt, since main passes the check.
      if (net <= 0 || !measuredFile(file) || main.barrel || main.lines > limit) {
        continue;
      }
      const ahead = queued
        .filter((each) => each.pull.files.includes(file))
        .map((each) => ({ n: each.pull.number, net: each.pull.fileNet[file] ?? 0 }));
      const total = main.lines + net + ahead.reduce((sum, each) => sum + each.net, 0);
      if (total > limit) {
        const parts = ahead
          .map((each) => `, #${each.n} ${each.net >= 0 ? "+" : ""}${each.net}`)
          .join("");
        return {
          ...row,
          pass: false,
          sizeHold: { file, main: main.lines, net, ahead, total },
          reasons: [
            ...row.reasons,
            `file size: ${file} would be ${total} lines (main ${main.lines}${parts}, this PR +${net}); the limit is ${limit}`,
          ],
        };
      }
    }
    return row;
  });
}
