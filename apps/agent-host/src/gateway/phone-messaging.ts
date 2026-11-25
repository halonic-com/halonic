import type { AgentMessaging, PhoneMessaging, TeamStatus } from "@halonicjs/ports";

/**
 * The host's allow-list view of its agent ports for a paired phone
 * (architecture note section 2.3 on HAL-17511). Each member is named and
 * forwarded on its own, with no spread and no proxy, so a member the hub
 * gains later never reaches a phone without a line here and its own "safe
 * from the phone" decision.
 */
export function phoneMessaging(messaging: AgentMessaging, team: TeamStatus): PhoneMessaging {
  return {
    listSources: () => messaging.listSources(),
    listAgents: () => messaging.listAgents(),
    listConversations: () => messaging.listConversations(),
    listMessages: (conversation) => messaging.listMessages(conversation),
    listInboxItems: () => messaging.listInboxItems(),
    listWork: () => messaging.listWork(),
    search: (text) => messaging.search(text),
    answer: (item, answer) => messaging.answer(item, answer),
    // The phone sends no files, and only `to` of the options: nothing else reaches the hub.
    send: (conversation, body, _attachments, options) =>
      messaging.send(
        conversation,
        body,
        undefined,
        options?.to === undefined ? undefined : { to: options.to },
      ),
    changes: () => messaging.changes(),
    team: {
      parts: () => team.parts(),
      spend: (range) => team.spend(range),
      seats: () => team.seats(),
      pullRequests: () => team.pullRequests(),
      pullRequest: (id) => team.pullRequest(id),
      mergeQueue: () => team.mergeQueue(),
      changes: () => team.changes(),
    },
  };
}
