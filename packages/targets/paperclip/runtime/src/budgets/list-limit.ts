import type { ActionCall } from "../handlers.ts";
import type { AgentRecord } from "../host.ts";

/**
 * Paperclip's lists stop at a limit, and a report that read a full page
 * can't know what came after it. These helpers ask for the most a list
 * gives and say so in the report when the answer reached it, so nobody is
 * silently missing (Liam's note on #6011).
 */

/** The most items one Paperclip list call returns. */
export const LIST_LIMIT = 500;

/** A list as Paperclip returned it, with a note when it reached the limit. */
export interface LimitedList<Item> {
  readonly items: readonly Item[];
  /** The line the report shows when the list may be cut off; null when it is whole. */
  readonly limitNote: string | null;
}

/**
 * The note for a list of `what` that returned `count` items, or null when
 * it is under the limit.
 *
 * @example
 * limitNote("agents", 500); // "Note: Paperclip's agent list stops at 500 agents and returned 500, so any after those are missing here."
 */
export function limitNote(what: string, count: number): string | null {
  if (count < LIST_LIMIT) return null;
  const one = what.replace(/s$/, "");
  return `Note: Paperclip's ${one} list stops at ${LIST_LIMIT} ${what} and returned ${count}, so any after those are missing here.`;
}

/** The company's agents, up to the limit, with the note when it was reached. */
export async function listAgents(call: ActionCall): Promise<LimitedList<AgentRecord>> {
  const { paperclip, companyId } = call;
  const items = await paperclip.agents.list({ companyId, limit: LIST_LIMIT });
  return { items, limitNote: limitNote("agents", items.length) };
}
