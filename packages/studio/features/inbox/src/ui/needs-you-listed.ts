import type { InboxItem } from "../inbox-items.ts";
import type { ProposalItem } from "../proposal-items.ts";

/**
 * What Needs you lists: the items that wait, and the open proposal once nothing is left to decide
 * in it, at the place its row had (HAL-11945 Q10). Its row stays, muted, until another row is
 * selected or the Inbox is left, so the list doesn't jump under the pointer. It isn't one of the
 * items, so the count drops at once.
 *
 * @param decided the proposals with nothing left to decide, not settled yet (`InboxState.decided`)
 * @param openAt where the open row was when last seen in the items
 */
export function needsYouListed(
  items: readonly InboxItem[],
  decided: readonly ProposalItem[],
  open: InboxItem | null,
  openAt: number,
): readonly InboxItem[] {
  if (open?.kind !== "proposal" || items.some((item) => item.key === open.key)) return items;
  const kept = decided.find((item) => item.key === open.key);
  if (kept === undefined) return items;
  const at = Math.min(Math.max(openAt, 0), items.length);
  return [...items.slice(0, at), kept, ...items.slice(at)];
}
