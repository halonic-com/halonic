import {
  type AgentMessaging,
  type ChannelResult,
  channelMembersMax,
  channelMembersMin,
  type MessagingAgent,
  type MessagingId,
} from "@halonicjs/ports";
import type { ConversationRow } from "./messenger.ts";

/** A channel's members and its lead, as `setMembers` takes them. */
export interface Membership {
  readonly members: readonly MessagingId[];
  readonly lead: MessagingId;
}

/** The channel's members as its conversation lists them, agents its source no longer lists too. */
export function membersOf(row: ConversationRow): readonly MessagingId[] {
  return row.conversation.members ?? [row.conversation.agent];
}

/** The agents of the channel's source who aren't in it, so Add an agent offers them. */
export function addable(row: ConversationRow): readonly MessagingAgent[] {
  const members = membersOf(row);
  return row.sourceAgents.filter((agent) => !members.includes(agent.id));
}

/** Whether one more agent fits: a channel has at most 8. */
export function canAdd(row: ConversationRow): boolean {
  return membersOf(row).length < channelMembersMax;
}

/** Whether a member can be removed: a channel keeps at least 2. */
export function canRemove(row: ConversationRow): boolean {
  return membersOf(row).length > channelMembersMin;
}

/** The channel with `agent` added; the lead stays. */
export function withAgent(row: ConversationRow, agent: MessagingId): Membership {
  return { members: [...membersOf(row), agent], lead: row.conversation.agent };
}

/** The channel without `agent`. Removing the lead takes `newLead`, picked first (flow H). */
export function withoutAgent(
  row: ConversationRow,
  agent: MessagingId,
  newLead: MessagingId = row.conversation.agent,
): Membership {
  return { members: membersOf(row).filter((member) => member !== agent), lead: newLead };
}

/** The channel with `agent` as its lead. */
export function withLead(row: ConversationRow, agent: MessagingId): Membership {
  return { members: membersOf(row), lead: agent };
}

/**
 * Changing a channel's members and leaving it, on the port (requirement `messenger.members`).
 * Only the person's own picks reach these calls; nothing a message says does
 * (`messenger.channel-authority`).
 */
export class ChannelAdmin {
  private readonly messaging: AgentMessaging;

  constructor(messaging: AgentMessaging) {
    this.messaging = messaging;
  }

  /** Whether the channel has messages, which a new member would read. */
  async hasHistory(channel: MessagingId): Promise<boolean> {
    const messages = await this.messaging.listMessages(channel);
    return messages.length > 0;
  }

  /** Sets a channel's members. The screen has said that a new member reads the history first. */
  setMembers(channel: MessagingId, membership: Membership): Promise<ChannelResult> {
    return this.messaging.setMembers(channel, membership.members, membership.lead);
  }

  /** The person leaves a channel, once they said so. */
  leave(channel: MessagingId): Promise<ChannelResult> {
    return this.messaging.leaveChannel(channel);
  }
}
