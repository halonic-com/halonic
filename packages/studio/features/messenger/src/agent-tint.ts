import type { MessagingAuthor } from "@halonicjs/ports";
import { type AgentTint, agentTint as tintOf } from "@halonicjs/studio-kit";
import { isChannel } from "./channel.ts";
import type { ConversationRow } from "./messenger.ts";

/**
 * An agent's bubble colour (`messenger.agent-bubbles`): the kit's tint for the agent's ID alone
 * (`kit.agent-tint`), so an agent keeps one colour in every chat and channel, across restarts, and
 * on its avatar. A message by a person other than the user takes its colour from their name.
 */
export function agentTint(author: Exclude<MessagingAuthor, { kind: "me" }>): AgentTint {
  return tintOf(author.kind === "agent" ? author.agent : author.name);
}

/**
 * A chat's agent's tint, for its avatar in the list, the header and Needs you, the same as its
 * bubbles (`kit.avatar-tint`). A channel holds several agents, so its avatar stays neutral.
 */
export function chatTint(row: ConversationRow): AgentTint | undefined {
  return isChannel(row) ? undefined : tintOf(row.conversation.agent);
}
