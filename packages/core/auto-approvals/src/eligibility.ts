// Whether a card could ever be decided by a rule. Shadow mode only records
// the answer; nothing here approves or denies. Every check can only block.

import type { ApprovalCard } from "./card.ts";
import { findKeyword } from "./claims.ts";
import type { EffectiveNeverList } from "./effective-list.ts";
import type { Hold } from "./never-list.ts";
import { approvalSources, approvalTypes, type EntryKind, isKnown } from "./vocabulary.ts";

/** Why a card gets no decision. */
export type NotEligibleReason =
  | "card.tool_gateway"
  | "card.unknown_type"
  | "card.unknown_source"
  | "card.touched"
  | "card.untyped"
  | "never_list.entry"
  | "never_list.hold"
  | "never_list.keyword";

/** A rule may decide the card, or the first reason it may not. */
export type Eligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: NotEligibleReason };

/**
 * Checks a card against the card rules and the never-list in force.
 *
 * @param card - the typed card
 * @param claims - every text an agent wrote about the approval, from `toCard`
 * @param neverList - the never-list in force, from `effectiveNeverList`
 */
export function checkEligibility(
  card: ApprovalCard,
  claims: readonly string[],
  neverList: EffectiveNeverList,
): Eligibility {
  // Approving a tool-gateway call runs a stored high-risk tool call: never,
  // whatever the never-list says.
  if (card.approvalSource === "tool_gateway") return notEligible("card.tool_gateway");
  if (!isKnown(approvalTypes, card.approvalType)) return notEligible("card.unknown_type");
  if (card.approvalSource !== null && !isKnown(approvalSources, card.approvalSource)) {
    return notEligible("card.unknown_source");
  }
  if (!card.untouched) return notEligible("card.touched");
  if (neverList.entries.some((entry) => entry.kind !== "keyword" && blocks(card, entry))) {
    return notEligible("never_list.entry");
  }
  if (neverList.holds.some((hold) => covers(hold, card))) return notEligible("never_list.hold");
  const keywords = neverList.entries.filter((entry) => entry.kind === "keyword");
  if (
    findKeyword(
      claims,
      keywords.map((entry) => entry.value),
    ) !== undefined
  ) {
    return notEligible("never_list.keyword");
  }
  if (card.kind === "untyped") return notEligible("card.untyped");
  return { eligible: true };
}

function blocks(card: ApprovalCard, entry: { kind: EntryKind; value: string }): boolean {
  switch (entry.kind) {
    case "approval_type":
      return card.approvalType === entry.value;
    case "approval_source":
      return card.approvalSource === entry.value;
    case "target_type":
      return card.target.type === entry.value;
    case "path_class":
      return card.pathClasses.some((pathClass) => pathClass === entry.value);
    case "keyword":
      return false;
  }
}

function covers(hold: Hold, card: ApprovalCard): boolean {
  return hold.covers === "all" || hold.covers.some((type) => type === card.approvalType);
}

function notEligible(reason: NotEligibleReason): Eligibility {
  return { eligible: false, reason };
}
