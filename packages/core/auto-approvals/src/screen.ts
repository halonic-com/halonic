// Whether a card could be decided at all, and every reason it can't. Claims are
// read here only to add blocks; nothing a claim says can remove one.

import type { ApprovalCard } from "./card.ts";
import { findKeywords } from "./keyword.ts";
import { approvalSources, approvalTypes, type EntryKind, isOneOf } from "./known-values.ts";
import type { NeverList } from "./never-list.ts";

export type BlockReason =
  | "card.untyped"
  | "card.touched"
  | "card.tool_gateway"
  | "card.unknown_type"
  | "card.unknown_source"
  | "never_list.approval_type"
  | "never_list.approval_source"
  | "never_list.target_type"
  | "never_list.path_class"
  | "never_list.keyword"
  | "never_list.hold";

export type Screening =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reasons: readonly BlockReason[] };

/**
 * Screens `card` against the never-list in effect. In v1 every card is
 * `untyped`, so the answer is always `eligible: false`; the other reasons are
 * still collected for the shadow digest and its near misses.
 */
export function screenCard(card: ApprovalCard, list: NeverList): Screening {
  const { claims } = card;
  const reasons: BlockReason[] = [];
  if (card.kind === "untyped") reasons.push("card.untyped");
  if (!card.untouched) reasons.push("card.touched");
  if (claims.source === "tool_gateway") reasons.push("card.tool_gateway");
  if (!isOneOf(approvalTypes, claims.approvalType)) reasons.push("card.unknown_type");
  if (claims.source !== null && !isOneOf(approvalSources, claims.source))
    reasons.push("card.unknown_source");

  const listed = (kind: EntryKind, value: string) =>
    list.entries.some((entry) => entry.kind === kind && entry.value === value);
  if (listed("approval_type", claims.approvalType)) reasons.push("never_list.approval_type");
  if (claims.source !== null && listed("approval_source", claims.source))
    reasons.push("never_list.approval_source");
  if (listed("target_type", card.target.type)) reasons.push("never_list.target_type");
  if (card.pathClasses.some((pathClass) => listed("path_class", pathClass)))
    reasons.push("never_list.path_class");

  const keywords = list.entries
    .filter((entry) => entry.kind === "keyword")
    .map((entry) => entry.value);
  if (findKeywords(keywords, claims.texts).length > 0) reasons.push("never_list.keyword");

  const held = list.holds.some(
    (hold) => hold.covers === "all" || hold.covers.some((type) => type === claims.approvalType),
  );
  if (held) reasons.push("never_list.hold");

  return reasons.length === 0 ? { eligible: true } : { eligible: false, reasons };
}
