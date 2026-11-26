import { routineRefusal } from "../reviewer-paths.ts";
import { manifestFileOf } from "../reviewer-paths-manifest.ts";
import { pathReviewer } from "../reviewer-paths-who.ts";
import { type GateVerdictPull, type RecordedGate, unreadGate } from "../verdicts/gate.ts";
import { type ApprovalVerdict, approvalOf, routedOf } from "./approval.ts";
import { type ChangeRequest, changeRequestOf } from "./change-request.ts";
import { isSecurityPull, securityReason } from "./security-signoff.ts";
import type { GatePull, MergeSnapshot } from "./snapshot.ts";

/**
 * The approval part of the gate (MERGER.md §4 rules 1–6 and the security
 * sign-off), from one of two sources: the signed lines in PR comments, or,
 * once the board's flag is on (`verdictGate`, HAL-19969), only the recorded
 * verdicts (`recordedGateOf`, read before the pass decides).
 */

/** The approval, an open change request and the gate's reasons about them. */
export interface ApprovalSide {
  readonly approval: ApprovalVerdict | null;
  readonly changeRequest: ChangeRequest | null;
  readonly reReview: boolean;
  /** The recorded verdicts couldn't be read: not approved, but no reason to remove it from the queue. */
  readonly unread: boolean;
  readonly reasons: readonly string[];
}

function utc(at: string): string {
  return at.slice(0, 16).replace("T", " ");
}

/** The approval part from PR comments, as before the flag. */
export function commentSide(
  snapshot: MergeSnapshot,
  pull: GatePull,
  teamLogin: string,
): ApprovalSide {
  const result = approvalOf(pull, teamLogin, snapshot.patchIds);
  const reasons = [...result.reasons];
  const changeRequest = changeRequestOf(pull, teamLogin, result.approval);
  if (changeRequest !== null) {
    reasons.push(
      `changes requested by ${changeRequest.who} at ${utc(changeRequest.at)} UTC, newer than the approval for head ${pull.head.slice(0, 9)}: needs a new approval that names the new head`,
    );
  }
  const security = securityReason(pull, teamLogin);
  if (security !== undefined) {
    reasons.push(security);
  }
  return {
    approval: result.approval,
    changeRequest,
    reReview: result.reReview,
    unread: false,
    reasons,
  };
}

/**
 * What the recorded verdicts' gate needs about a pull request in the
 * snapshot, routed as the gate routes it. The snapshot lists up to 100
 * files: with more, the review rules can't be checked and it isn't approved.
 */
export function gateVerdictPullOf(
  pull: GatePull,
  repo: string,
  patchIds: Readonly<Record<string, string | null>>,
): GateVerdictPull {
  const routed = routedOf(pull);
  const all = pull.filesTotal <= pull.files.length;
  return {
    repo,
    number: pull.number,
    head: pull.head,
    branch: pull.branch,
    ownBranch: !pull.crossRepository,
    openedBy: pull.author ?? "",
    filesTotal: pull.filesTotal,
    filesRead: pull.files.length,
    reviewer: all ? pathReviewer(routed) : undefined,
    routineRefusal: routineRefusal(routed),
    fingerprint: patchIds[pull.head] ?? null,
    manifestFile: manifestFileOf(pull.files),
  };
}

/** The gate's approval verdict from the records: null when nobody recorded one. */
function recordedApproval(gate: RecordedGate): ApprovalVerdict | null {
  const counting = gate.approvals.find((approval) => approval.counts);
  if (!gate.approved || counting === undefined) {
    return gate.approvals.length === 0 ? null : { ok: false };
  }
  return {
    ok: true,
    julian: counting.by === "Julian",
    nora: counting.by === "Nora",
    ...(counting.carriedFrom === undefined ? {} : { carried: counting.carriedFrom }),
  };
}

/**
 * The approval part from the recorded verdicts. A pull request whose records
 * weren't read this pass, or whose read failed, isn't approved and is unread.
 */
export function recordedSide(snapshot: MergeSnapshot, pull: GatePull): ApprovalSide {
  const gate: RecordedGate =
    snapshot.recorded?.[String(pull.number)] ??
    unreadGate("the recorded verdicts weren't read this pass");
  const [hold] = gate.holds;
  const reasons = [...gate.reasons];
  if (isSecurityPull(pull) && !gate.securityOk) {
    reasons.push(
      `security PR: waiting for Julian's recorded security-ok on head ${pull.head.slice(0, 9)}`,
    );
  }
  return {
    approval: recordedApproval(gate),
    changeRequest: hold === undefined ? null : { who: hold.by, at: hold.at },
    reReview: false,
    unread: gate.unread === true,
    reasons,
  };
}
