import { snapshotReviewer } from "../snapshot/reviewers.ts";
import type { OpenFacts, SnapshotPull } from "../snapshot/shape.ts";

/**
 * What the fast-track rules read off one pull request: whose approval
 * counts, which failing checks are worth a nudge, whether it is green.
 */
/** A check the monitor ignores: it runs outside the merge's gate. */
export const ignoredCheck = "Live cloud suites passed";

/** The reviewer whose approval counts here: the one the snapshot names (`snapshotReviewer`, HAL-19653). */
export function reviewerOf(pull: SnapshotPull): string {
  return snapshotReviewer(pull);
}

/** Approved on its current head by its reviewer, by the monitor's rule. */
export function approvedOnHead(pull: SnapshotPull, open: OpenFacts): boolean {
  const reviewer = reviewerOf(pull);
  return open.approvals.some(({ by, head }) => by === reviewer && pull.head.startsWith(head));
}

function isNoteCheck(name: string): boolean {
  return name.startsWith("Decision note");
}

/** The requirement guard fails too while a note waits for its signature (#5133, #5059). */
function isGuardCheck(name: string): boolean {
  return name.startsWith("Requirements and the requirement guard");
}

/**
 * The failing checks worth a nudge. A decision note, and the requirement
 * guard with it, waits for its signature until the reviewer approves, and
 * `ci-ok` is red only through the others, so it is left out while another
 * check still runs or when only those fail.
 */
export function failingToNudge(pull: SnapshotPull, open: OpenFacts, base: string): string[] {
  const failing = (open.failingChecks ?? (open.ciOk === "failure" ? ["ci-ok"] : [])).filter(
    (name) => name !== ignoredCheck,
  );
  const noteOnly = failing.some(isNoteCheck) && (!approvedOnHead(pull, open) || pull.base !== base);
  const kept = failing.filter((name) => !(noteOnly && (isNoteCheck(name) || isGuardCheck(name))));
  const others = kept.filter((name) => name !== "ci-ok");
  if (kept.includes("ci-ok") && others.length === 0 && (pendingOf(open).length > 0 || noteOnly)) {
    return [];
  }
  return kept;
}

/** The checks still running that count. */
export function pendingOf(open: OpenFacts): readonly string[] {
  const pending = open.pendingChecks ?? (open.ciOk === "pending" ? ["ci-ok"] : []);
  return pending.filter((name) => name !== ignoredCheck);
}

/** `ci-ok` green, nothing failing that counts, nothing still running. */
export function isGreen(pull: SnapshotPull, open: OpenFacts, base: string): boolean {
  return (
    open.ciOk === "success" &&
    failingToNudge(pull, open, base).length === 0 &&
    pendingOf(open).length === 0
  );
}

/** A label is a bot's when GitHub marks its author as one: `dependabot[bot]`, `renovate[bot]`. */
export function isBot(login: string | null | undefined): boolean {
  return login?.endsWith("[bot]") === true;
}
