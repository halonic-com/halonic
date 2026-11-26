import type { AskAgent } from "../ask-session.ts";
import { quickAskWords } from "../quick-ask-words.ts";

/** One heading of the agent picker and its agents. */
export interface PickerGroup {
  readonly label: string;
  readonly agents: readonly AskAgent[];
}

/** How many agents **Recent** shows: the newest chats, as Messenger orders them. */
export const RECENT_AGENTS = 3;

/**
 * The picker's groups (design HAL-18594, section 4): **Recent** first, then each workspace and
 * team by its name, with each agent once. Typing narrows every group to the agents whose name
 * holds the text, and then **Recent** is left out, so each match shows under its own workspace.
 *
 * @example
 * pickerGroups(agents, "");
 * // [{ label: "Recent", agents: [chief, liam, noah] }, { label: "Paperclip · Acme", agents: [elena] }]
 */
export function pickerGroups(agents: readonly AskAgent[], query: string): readonly PickerGroup[] {
  const text = query.trim().toLocaleLowerCase();
  const matching =
    text === ""
      ? agents
      : agents.filter((each) => each.agent.name.toLocaleLowerCase().includes(text));
  const recent = text === "" ? matching.slice(0, RECENT_AGENTS) : [];
  const groups: PickerGroup[] =
    recent.length > 0 ? [{ label: quickAskWords.recent, agents: recent }] : [];
  const bySource = new Map<string, AskAgent[]>();
  for (const each of matching.slice(recent.length)) {
    const label = each.row.source?.label ?? "";
    bySource.set(label, [...(bySource.get(label) ?? []), each]);
  }
  for (const [label, inSource] of bySource) groups.push({ label, agents: inSource });
  return groups;
}

/** The id the picker gives an agent's row: its chat's id. */
export function agentKey(agent: AskAgent): string {
  return agent.row.conversation.id;
}
