import type {
  AgentMessaging,
  Conversation,
  InboxItem,
  MessagingAgent,
  MessagingId,
  MessagingSource,
  SearchHit,
  WorkItem,
} from "@halonicjs/ports";
import { type ActiveAccount, chooseSource } from "./active-account.ts";

/**
 * Shows one linked account at a time: reads give only the active account's sources, agents,
 * conversations, inbox items, work, channels and search hits, and `changes` leaves out the other
 * accounts' events but adds one when the pick changes, so Inbox and Messenger read again. Writes,
 * message and attachment reads pass through, because their IDs already belong to one source.
 * A thread two accounts both see appears once, under the active one.
 */
export function scopeToAccount(inner: AgentMessaging, active: ActiveAccount): AgentMessaging {
  const current = async (): Promise<MessagingId | undefined> =>
    chooseSource(await inner.listSources(), active.preferred());
  const only = async <T extends { readonly source: MessagingId }>(
    read: () => Promise<readonly T[]>,
  ): Promise<readonly T[]> => {
    const [items, source] = await Promise.all([read(), current()]);
    return items.filter((item) => item.source === source);
  };
  return {
    listSources: async (): Promise<readonly MessagingSource[]> => {
      const [sources, source] = await Promise.all([inner.listSources(), current()]);
      return sources.filter((each) => each.id === source);
    },
    listAgents: (): Promise<readonly MessagingAgent[]> => only(() => inner.listAgents()),
    listConversations: (): Promise<readonly Conversation[]> =>
      only(() => inner.listConversations()),
    listInboxItems: (): Promise<readonly InboxItem[]> => only(() => inner.listInboxItems()),
    listWork: (): Promise<readonly WorkItem[]> => only(() => inner.listWork()),
    search: (text): Promise<readonly SearchHit[]> => only(() => inner.search(text)),
    browseChannels: (): Promise<readonly Conversation[]> => only(() => inner.browseChannels()),
    listMessages: (conversation) => inner.listMessages(conversation),
    answer: (item, answer) => inner.answer(item, answer),
    readAttachment: (attachment) => inner.readAttachment(attachment),
    send: (conversation, body, attachments, options) =>
      inner.send(conversation, body, attachments, options),
    startChannel: (title, members, lead) => inner.startChannel(title, members, lead),
    setMembers: (channel, members, lead) => inner.setMembers(channel, members, lead),
    joinChannel: (channel) => inner.joinChannel(channel),
    leaveChannel: (channel) => inner.leaveChannel(channel),
    changes: () => scopedChanges(inner, active, current),
  };
}

/** The active account's changes, plus one whenever the pick changes. Ends when the reader stops. */
async function* scopedChanges(
  inner: AgentMessaging,
  active: ActiveAccount,
  current: () => Promise<MessagingId | undefined>,
): AsyncGenerator<MessagingId> {
  // Armed before the switch is handled, so a second switch during the read is seen, not lost.
  let wake = (): void => undefined;
  const arm = (): Promise<"switch"> =>
    new Promise((resolve) => {
      wake = () => resolve("switch");
    });
  let arrived = arm();
  const stop = active.subscribe(() => wake());
  const iterator = inner.changes()[Symbol.asyncIterator]();
  let next = iterator.next();
  try {
    while (true) {
      const winner = await Promise.race([next, arrived]);
      if (winner === "switch") {
        arrived = arm();
        const source = await current();
        if (source !== undefined) yield source;
        continue;
      }
      if (winner.done === true) return;
      next = iterator.next();
      if (winner.value === (await current())) yield winner.value;
    }
  } finally {
    stop();
    await iterator.return?.();
  }
}
