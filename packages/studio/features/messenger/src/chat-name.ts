import type { MessagingAgent } from "@halonicjs/ports";
import { isChannel } from "./channel.ts";
import type { ConversationRow } from "./messenger.ts";

/**
 * The chat's agent, as its source lists it; none for a channel, or while the source doesn't list
 * the agent.
 */
export function chatAgent(row: ConversationRow): MessagingAgent | undefined {
  if (isChannel(row)) return undefined;
  const isTheAgent = (agent: MessagingAgent) => agent.id === row.conversation.agent;
  return row.agents.find(isTheAgent) ?? row.sourceAgents.find(isTheAgent);
}

/**
 * What the list row and the header call a conversation (requirement `messenger.agent-names`): a
 * chat by its agent, "Liam · CTO", or "Chief" alone when the agent has no title; a channel, or a
 * chat whose agent isn't listed, by its own title.
 *
 * @example
 * chatName(row); // "Elena · Studio Engineer"
 */
export function chatName(row: ConversationRow): string {
  const agent = chatAgent(row);
  if (agent === undefined) return row.conversation.title;
  const title = agent.title?.trim() ?? "";
  return title === "" ? agent.name : `${agent.name} · ${title}`;
}
