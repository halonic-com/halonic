import { carryRepos } from "../pr-watcher/carry-over.ts";
import { short } from "../pr-watcher/decide.ts";
import { type PrStatus, untrustedNote } from "./pr-status.ts";

/**
 * The `rebase_pr` tool (HAL-18984): whether the calling agent's own pull
 * request can be rebased on its base without a checkout, and whether its
 * approval carries over the rebase. Rules only, no I/O, like `carry-over.ts`.
 *
 * This part only reads. GitHub's rebase itself goes through the branch write
 * client (`branch-update/write-client.ts`) once the board decides on the
 * branch credential (HAL-18091) and Julian gives his OK; until then the
 * answer gives the commands to run instead.
 */

/**
 * `rebase`: no conflict and behind its base, so GitHub can rebase it.
 * `up-to-date`: nothing to do. `refused`: not this tool's to rebase, for the reason given.
 */
export type RebaseVerdict = "rebase" | "up-to-date" | "refused";

/** What `rebase_pr` returns. */
export interface RebaseCheck {
  readonly repo: string;
  readonly number: number;
  readonly url: string;
  readonly branch: string;
  readonly base: string;
  readonly head: string;
  readonly verdict: RebaseVerdict;
  readonly reason: string;
  /** The approvals counting on the current head, as `<who> on <head>`. */
  readonly approvals: readonly string[];
  /** Whether those approvals carry to the rebased head when its changes stay the same. */
  readonly carries: boolean;
  /** Why they carry, or why they don't. */
  readonly carryNote: string;
  /** The commands to run in the agent's own clone, when the tool doesn't rebase. */
  readonly commands: readonly string[];
}

/** A branch name safe to put in a shell command as it is; anything else gets no command. */
const plainBranch = /^[A-Za-z0-9._/-]+$/;

/** The commands that rebase the branch by hand, or none for a branch name that isn't plain. */
function rebaseCommands(status: PrStatus): string[] {
  if (!plainBranch.test(status.branch) || !plainBranch.test(status.base)) {
    return [];
  }
  return [
    `git fetch origin ${status.base} && git rebase origin/${status.base}`,
    `git push --force-with-lease origin HEAD:${status.branch}`,
  ];
}

/**
 * Whether the approvals on the current head carry to the rebased head. The
 * Merger counts them there when the changes from the base stay the same
 * (`paperclip.merge-control-carry-over`), and the PR watcher then sends no
 * re-review (`paperclip.pr-watcher-rebase-carry`), with the same exceptions:
 * a security pull request by its paths, a release one, and Liam's own.
 */
function carryOver(status: PrStatus): Pick<RebaseCheck, "approvals" | "carries" | "carryNote"> {
  const approvals = status.approvals
    .filter((approval) => approval.counts)
    .map((approval) => `${approval.by} on ${short(approval.head)}`);
  const refusal = carryRefusal(status);
  if (approvals.length === 0) {
    return { approvals, carries: false, carryNote: "no approval on this head to carry over" };
  }
  if (refusal !== undefined) {
    return { approvals, carries: false, carryNote: `${refusal}, so it needs a re-review` };
  }
  return {
    approvals,
    carries: true,
    carryNote:
      "carries to the new head when the rebase changes no line: the Merger compares both, so don't send it for re-review",
  };
}

/** Why an approval doesn't carry over a rebase of this pull request, or undefined when it does. */
function carryRefusal(status: PrStatus): string | undefined {
  if (!carryRepos.has(status.repo)) {
    return `the Merger doesn't run ${status.repo}'s queue`;
  }
  if (status.securityFile !== undefined) {
    return `a security pull request by its paths (${JSON.stringify(status.securityFile)})`;
  }
  if (status.branch.startsWith("changeset-release/")) {
    return "a release pull request";
  }
  if (status.author === "liam") {
    return "Liam's own pull request";
  }
  return undefined;
}

/** Why the caller may not rebase it with this tool, or undefined when they may. */
function refusalOf(status: PrStatus, caller: string): string | undefined {
  if (status.state !== "open") {
    return `it's ${status.state}`;
  }
  if (status.author === undefined) {
    return "its branch names no agent, or it comes from a fork";
  }
  if (status.author !== caller.toLowerCase()) {
    return `it's ${status.author}'s pull request, and the tool rebases only your own`;
  }
  if (status.inQueue) {
    return "it's in the merge queue, which already tests it on top of main";
  }
  if (status.mergeable === "conflict") {
    return "it conflicts with its base, so GitHub can't rebase it: rebase it by hand and fix the conflict";
  }
  if (status.mergeable === "unknown" || status.behindBase === undefined) {
    return "GitHub is still working out whether it merges: ask again in a minute";
  }
  return undefined;
}

/** The verdict and its reason in words. */
function verdictOf(status: PrStatus, caller: string): { verdict: RebaseVerdict; reason: string } {
  const refusal = refusalOf(status, caller);
  if (refusal !== undefined) {
    return { verdict: "refused", reason: refusal };
  }
  const behind = status.behindBase ?? 0;
  if (behind === 0) {
    return { verdict: "up-to-date", reason: `it's up to date with ${status.base}` };
  }
  const commits = `${behind} commit${behind === 1 ? "" : "s"}`;
  return { verdict: "rebase", reason: `${commits} behind ${status.base}, with no conflict` };
}

/** Decides what `rebase_pr` does with the pull request `status` describes, for the agent `caller`. */
export function rebaseCheck(status: PrStatus, caller: string): RebaseCheck {
  const { verdict, reason } = verdictOf(status, caller);
  const conflict = status.mergeable === "conflict" && status.state === "open";
  return {
    repo: status.repo,
    number: status.number,
    url: status.url,
    branch: status.branch,
    base: status.base,
    head: status.head,
    verdict,
    reason,
    ...carryOver(status),
    commands: verdict === "rebase" || conflict ? rebaseCommands(status) : [],
  };
}

/** The short text an agent reads. The branch is GitHub text, so it stays JSON-quoted. */
export function rebaseCheckText(check: RebaseCheck): string {
  const lines = [
    `#${check.number} (${check.repo})`,
    `${untrustedNote}; branch ${JSON.stringify(check.branch)} on ${JSON.stringify(check.base)}; head ${short(check.head)}`,
    `${check.verdict}: ${check.reason}`,
  ];
  if (check.verdict === "rebase") {
    lines.push(
      "GitHub's rebase without a checkout waits for the board's decision on the branch credential (HAL-18091); until then, rebase in your clone.",
    );
  }
  if (check.verdict !== "up-to-date" && check.approvals.length > 0) {
    lines.push(`approvals: ${check.approvals.join("; ")}: ${check.carryNote}`);
  }
  if (check.verdict === "rebase" && check.approvals.length > 0) {
    lines.push(
      "It's approved: rebase only when the queue session asked or it conflicts, since an unneeded rebase costs a CI run (HAL-18722).",
    );
  }
  if (check.commands.length > 0) {
    lines.push("commands:", ...check.commands.map((command) => `  ${command}`));
  }
  return lines.join("\n");
}
