import type { InboxItem, Message, MessagingId } from "@halonicjs/ports";
import { agentName } from "./channel.ts";
import type { ConversationRow } from "./messenger.ts";

/** A question an agent asked the person in a channel, still open: the Inbox's own item. */
export interface ChannelQuestion {
  readonly item: InboxItem;
  /** The agent's name, as the channel's source lists it. */
  readonly agent: string;
  /** The agent's ID, for its tint on the asker's avatar (`messenger.agent-avatar-tint`). */
  readonly agentId: MessagingId;
}

/**
 * The questions still waiting for the person in a channel, oldest first (flow K): the open inbox
 * items of the channel's source whose work is a work line that asks the person, under one of the
 * channel's messages. An agent the source no longer lists shows no line, so it counts no question.
 */
export function channelQuestions(
  row: ConversationRow,
  messages: readonly Message[],
  items: readonly InboxItem[],
): readonly ChannelQuestion[] {
  const asking = new Map<MessagingId, MessagingId>();
  for (const share of messages.flatMap((message) => message.work ?? [])) {
    if (share.state === "asks-you" && share.work !== undefined) asking.set(share.work, share.agent);
  }
  return items
    .filter((item) => item.state.kind === "open" && item.source === row.conversation.source)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .flatMap((item) => {
      const agent = item.work === undefined ? undefined : asking.get(item.work);
      const name = agent === undefined ? undefined : agentName(row, agent);
      return name === undefined || agent === undefined
        ? []
        : [{ item, agent: name, agentId: agent }];
    });
}
