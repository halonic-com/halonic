import type { OpenFacts, SnapshotPull, SnapshotRepo } from "../../snapshot/shape.ts";

/**
 * The first step of the `fast-track` signal rule (HAL-18320): what the rule
 * reads off each `fast-track` pull request, worked out the way
 * `fast-track/checks.ts` and the label check of `fast-track/rules.ts` do it.
 * The runtime passes the result to `fast-track.ts` as `checks`. Pure like
 * every rule here: type imports only, no I/O, no clock.
 */

/** What the first step reads: the repository and the board's label settings. */
export interface FastTrackCheckInput {
  readonly repo: SnapshotRepo;
  /** The board's GitHub login (plugin setting `fastTrackLabelAdder`), empty when unset. */
  readonly labelAdder: string;
  /** Where a label added as `halonic-dev` counts, resolved from `fastTrackSharedLabelScope`. */
  readonly sharedScope: { readonly pulls: readonly string[]; readonly tasks: readonly string[] };
}

/** One `fast-track` pull request, as the second step reads it. */
export interface PullCheck {
  readonly number: number;
  /** Its task, from an own branch named `<agent>/HAL-<n>-…`; null for a fork or another name. */
  readonly task: string | null;
  /** The reviewer the snapshot names (HAL-19653), or null in a snapshot saved before it named one. */
  readonly reviewer: string | null;
  /** Its reviewer's signed approval names its head. */
  readonly approved: boolean;
  /** Checks still running that count. */
  readonly pending: boolean;
  /** The failing checks worth a nudge. */
  readonly failing: readonly string[];
  /** `ci-ok` green, nothing failing that counts, nothing still running. */
  readonly green: boolean;
  /** The board added the label, or `halonic-dev` within its scope: only then may it jump. */
  readonly labelCounts: boolean;
  /** Who added the label, as GitHub says; null when it doesn't. */
  readonly labelBy: string | null;
  /** When the label was added, null when GitHub doesn't say. */
  readonly labelAt: string | null;
  /** A bot opened it (`dependabot[bot]`): bot pull requests never get the label (HAL-16033). */
  readonly bot: boolean;
}

/** The account the board and Chief add the label through (MERGER.md rule 3). */
const sharedLabelAdder = "halonic-dev";

/** A check the monitor ignores: it runs outside the merge's gate. */
const ignoredCheck = "Live cloud suites passed";

function taskOf(repo: string, pull: SnapshotPull): string | null {
  const own = pull.headRepo?.toLowerCase() === repo.toLowerCase();
  const match = /^[\w.-]+\/([a-z]+-\d+)(?:-|$)/i.exec(pull.branch);
  return own && match?.[1] !== undefined ? match[1].toUpperCase() : null;
}

function pendingOf(open: OpenFacts): readonly string[] {
  const pending = open.pendingChecks ?? (open.ciOk === "pending" ? ["ci-ok"] : []);
  return pending.filter((name) => name !== ignoredCheck);
}

/**
 * A decision note, and the requirement guard with it, waits for its
 * signature until the reviewer approves, and `ci-ok` is red only through the
 * others, so it is left out while another check still runs or when only
 * those fail (#5133, #5059).
 */
function failingToNudge(open: OpenFacts, approved: boolean, onBase: boolean): string[] {
  const failing = (open.failingChecks ?? (open.ciOk === "failure" ? ["ci-ok"] : [])).filter(
    (name) => name !== ignoredCheck,
  );
  const isNote = (name: string) => name.startsWith("Decision note");
  const isGuard = (name: string) => name.startsWith("Requirements and the requirement guard");
  const noteOnly = failing.some(isNote) && (!approved || !onBase);
  const kept = failing.filter((name) => !(noteOnly && (isNote(name) || isGuard(name))));
  const others = kept.filter((name) => name !== "ci-ok");
  if (kept.includes("ci-ok") && others.length === 0 && (pendingOf(open).length > 0 || noteOnly)) {
    return [];
  }
  return kept;
}

function labelCounts(input: FastTrackCheckInput, pull: SnapshotPull, by: string | null): boolean {
  if (by === sharedLabelAdder) {
    const task = taskOf(input.repo.repo, pull);
    const listed = input.sharedScope.pulls.includes(`${input.repo.repo}#${pull.number}`);
    return listed || (task !== null && input.sharedScope.tasks.includes(task));
  }
  return by !== null && input.labelAdder !== "" && by === input.labelAdder;
}

function checkOf(input: FastTrackCheckInput, pull: SnapshotPull, open: OpenFacts): PullCheck {
  // The pass names the reviewer in the snapshot (`snapshot/reviewers.ts`): a pure rule can't import the source.
  const reviewer = open.reviewer ?? null;
  const approved = open.approvals.some(
    ({ by, head }) => by === reviewer && pull.head.startsWith(head),
  );
  const failing = failingToNudge(open, approved, pull.base === input.repo.defaultBranch);
  const pending = pendingOf(open).length > 0;
  const label = open.labels.find((each) => each.name === "fast-track");
  const by = label?.addedBy ?? null;
  return {
    number: pull.number,
    task: taskOf(input.repo.repo, pull),
    reviewer,
    approved,
    pending,
    failing,
    green: open.ciOk === "success" && failing.length === 0 && !pending,
    labelCounts: labelCounts(input, pull, by),
    labelBy: by,
    labelAt: label?.addedAt ?? null,
    bot: open.author?.endsWith("[bot]") === true,
  };
}

/**
 * The checks of every open `fast-track` pull request, in the snapshot's order.
 *
 * @example
 * checkPulls({ repo, labelAdder: "", sharedScope: { pulls: [], tasks: [] } }); // [] without a label
 */
export function checkPulls(input: FastTrackCheckInput): PullCheck[] {
  return input.repo.pulls.flatMap((pull) => {
    const open = pull.open;
    const labelled = open?.labels.some((label) => label.name === "fast-track") === true;
    return open !== null && labelled ? [checkOf(input, pull, open)] : [];
  });
}
