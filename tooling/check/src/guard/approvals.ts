import type { DecisionKind } from "./decision-notes.ts";

/** What the guard asks about a decision note's approval. */
export interface ApprovalRequest {
  /** The link from the note's `Approval:` line. */
  readonly approval: string;
  /** The branch the pull request comes from. */
  readonly branch: string;
  /** Decides who must have approved (D13). */
  readonly kind: DecisionKind;
}

/** Whether the approval is real, approved by the right person and for this branch. */
export type ApprovalVerdict =
  | { readonly approved: true }
  | { readonly approved: false; readonly reason: string };

/**
 * Looks up a decision note's approval (plan 9.3). The guard asks this, so
 * an agent can't write its own approval into a note.
 */
export interface ApprovalLookup {
  check(request: ApprovalRequest): Promise<ApprovalVerdict>;
}

/**
 * STUB: the Paperclip approval lookup is not built yet. It needs a Paperclip
 * API token as a CI secret, which is the user's account to give (HAL-58).
 *
 * Until then it FAILS CLOSED: it answers "not approved" for every note, so a
 * decision note alone never lets a change through. Replace this with a real
 * lookup that checks the approval exists, is approved, was approved by the
 * user for `user-visible` and by the CTO for `internal`, and names `branch`.
 */
export const paperclipApprovals: ApprovalLookup = {
  check() {
    return Promise.resolve({
      approved: false,
      reason:
        "the guard can't check Paperclip approvals yet: that needs a Paperclip API token as a CI secret (HAL-58). Until then no decision note passes",
    });
  },
};
