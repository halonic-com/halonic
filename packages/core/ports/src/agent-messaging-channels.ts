import type {
  Conversation,
  MessagingAgent,
  MessagingId,
  MessagingRefusal,
} from "./agent-messaging.ts";

/** The fewest agents a channel has, its lead included. Fewer is a direct conversation. */
export const channelMembersMin = 2;

/** The most agents a channel has, its lead included (architecture note, phase 2, 1.2). */
export const channelMembersMax = 8;

/**
 * Who a message is addressed to. Apps fill `to` only from the person's own
 * picks (chips, or an `@` completion that becomes a chip), never by parsing
 * the message text: text never wakes an agent (ADR 2026-11-24, agent
 * messaging, version 4).
 */
export interface MessageSendOptions {
  /** Agents in the conversation who should answer. Empty or absent: the lead, or a direct conversation's agent. */
  to?: readonly MessagingId[];
}

/** Where one agent's share of a message the person sent stands. A state a provider can't map reads as `other`. */
export type MessageWorkState =
  | "starting"
  | "working"
  | "answered"
  | "asks-you"
  | "failed"
  | "passed-on"
  | "other";

/** What happened to one agent's share of a message the person sent: one work line under the message. */
export interface MessageWork {
  agent: MessagingId;
  state: MessageWorkState;
  /** The piece of work the request became, such as a Paperclip task, when the source makes one. */
  work?: MessagingId;
  /** For `passed-on`: the member it was handed to. */
  passedTo?: MessagingId;
  /** Since when it has been in this state, as ISO text. */
  since: string;
}

/** What starting a channel, changing its members, joining or leaving it did. */
export type ChannelResult =
  | { outcome: "done"; conversation: Conversation }
  | { outcome: "refused"; reason: MessagingRefusal };

/**
 * Whether these agents can make a channel: 2 to 8 agents the source listed,
 * none twice, all of one source, the lead among them. A provider and the
 * fake both check this before they start a channel or change its members,
 * and refuse with `bad-members` when it fails.
 *
 * @example
 * if (!channelMembersFit(members, lead, await messaging.listAgents())) return refuse("bad-members");
 */
export function channelMembersFit(
  members: readonly MessagingId[],
  lead: MessagingId,
  agents: readonly MessagingAgent[],
): boolean {
  if (members.length < channelMembersMin || members.length > channelMembersMax) return false;
  if (new Set(members).size !== members.length || !members.includes(lead)) return false;
  const sources = new Set(
    members.map((member) => agents.find((agent) => agent.id === member)?.source),
  );
  const [source] = sources;
  return sources.size === 1 && source !== undefined;
}

/**
 * Whether every agent in `to` is in the conversation: a channel's members, or
 * a direct conversation's one agent. A provider refuses a message whose `to`
 * names anyone else with `not-found`, and sends it to no one.
 */
export function addresseesFit(conversation: Conversation, to: readonly MessagingId[]): boolean {
  const members = conversation.members ?? [conversation.agent];
  return to.every((agent) => members.includes(agent));
}
