import { type AgentMessaging, gatewayMessagingIdPattern, type MessagingId } from "@halonicjs/ports";

/** Every source, agent, item, conversation, message and attachment id the port lists. */
async function listedIds(port: AgentMessaging): Promise<readonly MessagingId[]> {
  const sources = await port.listSources();
  const agents = await port.listAgents();
  const items = await port.listInboxItems();
  const conversations = await port.listConversations();
  const ids: MessagingId[] = [
    ...sources.map((source) => source.id),
    ...agents.flatMap((agent) => [agent.id, agent.source]),
    ...items.flatMap((item) => [item.id, ...item.attachments.map((attachment) => attachment.id)]),
  ];
  for (const conversation of conversations) {
    ids.push(
      conversation.id,
      conversation.source,
      conversation.agent,
      ...(conversation.members ?? []),
    );
    for (const message of await port.listMessages(conversation.id)) {
      ids.push(message.id, ...message.attachments.map((attachment) => attachment.id));
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
