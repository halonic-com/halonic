import {
  type AgentMessaging,
  gatewayMessagingIdPattern,
  type InboxItem,
  type MessagingAuthor,
  type MessagingId,
} from "@halonicjs/ports";

/** The agent an author names, which the phone checks as an id; none for the person or someone else. */
function authorIds(author: MessagingAuthor | undefined): readonly MessagingId[] {
  return author?.kind === "agent" ? [author.agent] : [];
}

/** Who answered or closed `item`, when an agent did. */
function stateIds(item: InboxItem): readonly MessagingId[] {
  return item.state.kind === "answered" || item.state.kind === "closed"
    ? authorIds(item.state.by)
    : [];
}

/**
 * Every source, agent, item, conversation, message and attachment id the port
 * lists, and the ids its values point at that the phone checks: a message's
 * `to`, an agent author and who answered an item.
 */
async function listedIds(port: AgentMessaging): Promise<readonly MessagingId[]> {
  const sources = await port.listSources();
  const agents = await port.listAgents();
  const items = await port.listInboxItems();
  const conversations = await port.listConversations();
  const ids: MessagingId[] = [
    ...sources.map((source) => source.id),
    ...agents.flatMap((agent) => [agent.id, agent.source]),
    ...items.flatMap((item) => [
      item.id,
      ...item.attachments.map((attachment) => attachment.id),
      ...stateIds(item),
    ]),
  ];
  for (const conversation of conversations) {
    ids.push(
      conversation.id,
      conversation.source,
      conversation.agent,
      ...(conversation.members ?? []),
    );
    for (const message of await port.listMessages(conversation.id)) {
      ids.push(
        message.id,
        ...message.attachments.map((attachment) => attachment.id),
        ...(message.to ?? []),
        ...authorIds(message.author),
      );
    }
  }
  return ids;
}

/**
 * The ids the port lists that break `gatewayMessagingIdPattern`, each once.
 * The phone reads a list holding one, but its session breaks when it hands
 * that id back, as in `msg-answer` or `msg-read`, or meets it as a
 * `msg-changed` source, so a provider must make none.
 */
export async function offPatternMessagingIds(
  port: AgentMessaging,
): Promise<readonly MessagingId[]> {
  const ids = await listedIds(port);
  return [...new Set(ids.filter((id) => !gatewayMessagingIdPattern.test(id)))];
}
