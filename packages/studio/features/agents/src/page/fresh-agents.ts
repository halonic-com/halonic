/**
 * The agents just made from the New agent dialog with nothing written in it. Their page opens on
 * Configuration › Behaviour with Instructions focused (`agents.page.new-agent`), so the person can
 * write what the agent does straight away. The dialog marks the agent before its tab opens; the
 * page asks, and forgets it once it is drawn, so reopening the agent later doesn't take the focus.
 */
const fresh = new Set<string>();

const keyOf = (hubId: string, id: string): string => `${hubId}/${id}`;

/** Marks an agent that has no instructions yet as just made. */
export function markFreshAgent(hubId: string, id: string): void {
  fresh.add(keyOf(hubId, id));
}

/** Whether the agent was just made and its page hasn't been drawn yet. */
export function isFreshAgent(hubId: string, id: string): boolean {
  return fresh.has(keyOf(hubId, id));
}

/** Forgets a just-made agent, once its page is drawn. */
export function forgetFreshAgent(hubId: string, id: string): void {
  fresh.delete(keyOf(hubId, id));
}
