import {
  type AgentMessaging,
  type ChannelResult,
  type Conversation,
  channelMembersMax,
  channelMembersMin,
  type MessagingAgent,
  type MessagingId,
  type MessagingSource,
} from "@halonicjs/ports";
import { channelAdminWords } from "./channel-admin-words.ts";
import type { ConversationRow } from "./messenger.ts";

/** A source and the agents it lists, for the New channel dialog's picker. */
export interface SourceAgents {
  readonly source: MessagingSource;
  readonly agents: readonly MessagingAgent[];
}

/** A source and its channels the person isn't in, for Browse channels. */
export interface SourceChannels {
  readonly source: MessagingSource;
  readonly channels: readonly Conversation[];
}

/** What the New channel dialog has picked so far. */
export interface NewChannelForm {
  readonly name: string;
  readonly picked: readonly MessagingId[];
}

/** Why **Create channel** stays off, if it does, and whether the picker is full. */
export interface NewChannelCheck {
  /** The line that says why Create channel can't be pressed yet; none when it can. */
  readonly blocked?: string;
  /** The name field's error: another channel in the source has that name. */
  readonly nameTaken?: string;
  /** 8 agents are picked, so the others can't be picked until one is taken off. */
  readonly full: boolean;
}

/**
 * Whether a channel can be made from `form` in `from` (flow G): its source online, 2 to 8 agents
 * picked, and a name no other channel of the source has, ignoring case. `taken` holds the names of
 * the source's channels, the person's and the others.
 */
export function checkNewChannel(
  form: NewChannelForm,
  from: SourceAgents,
  taken: readonly string[],
): NewChannelCheck {
  const words = channelAdminWords.create;
  const full = form.picked.length >= channelMembersMax;
  const name = form.name.trim();
  const clash = taken.some((each) => each.toLowerCase() === name.toLowerCase());
  const nameTaken = name !== "" && clash ? words.nameTaken(name) : undefined;
  const blocked = blockedBy(form, from) ?? nameTaken;
  return {
    full,
    ...(blocked === undefined ? {} : { blocked }),
    ...(nameTaken ? { nameTaken } : {}),
  };
}

function blockedBy(form: NewChannelForm, from: SourceAgents): string | undefined {
  const words = channelAdminWords.create;
  if (from.source.state.kind !== "online") return words.offline(from.source.label);
  if (from.agents.length < channelMembersMin) {
    return words.sourceTooSmall(from.source.label, from.agents.length);
  }
  if (form.picked.length < channelMembersMin) return words.tooFew;
  if (form.picked.length > channelMembersMax) return channelAdminWords.tooMany;
  return undefined;
}

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
 * Starting, browsing, joining and leaving channels and changing their members, on the port
 * (requirements `messenger.channel-create` and `messenger.members`). Only the person's own picks
 * reach these calls; nothing a message says does (`messenger.channel-authority`).
 */
export class ChannelAdmin {
  private readonly messaging: AgentMessaging;

  constructor(messaging: AgentMessaging) {
    this.messaging = messaging;
  }

  /** Each source with the agents it lists, for the New channel dialog. */
  async sources(): Promise<readonly SourceAgents[]> {
    const [sources, agents] = await Promise.all([
      this.messaging.listSources(),
      this.messaging.listAgents(),
    ]);
    return sources.map((source) => ({
      source,
      agents: agents.filter((agent) => agent.source === source.id),
    }));
  }

  /** The names of a source's channels, the person's and the others, so a new one doesn't repeat one. */
  async takenNames(source: MessagingId): Promise<readonly string[]> {
    const [mine, others] = await Promise.all([
      this.messaging.listConversations(),
      this.messaging.browseChannels(),
    ]);
    return [...mine, ...others]
      .filter((each) => each.source === source && each.members !== undefined)
      .map((each) => each.title);
  }

  /** Each source with its channels the person isn't in. */
  async browse(): Promise<readonly SourceChannels[]> {
    const [sources, channels] = await Promise.all([
      this.messaging.listSources(),
      this.messaging.browseChannels(),
    ]);
    return sources.map((source) => ({
      source,
      channels: channels.filter((channel) => channel.source === source.id),
    }));
  }

  /** Whether the channel has messages, which a new member would read. */
  async hasHistory(channel: MessagingId): Promise<boolean> {
    const messages = await this.messaging.listMessages(channel);
    return messages.length > 0;
  }

  /** Starts a channel with these agents and lead. */
  start(title: string, members: readonly MessagingId[], lead: MessagingId): Promise<ChannelResult> {
    return this.messaging.startChannel(title, members, lead);
  }

  /** Sets a channel's members. The screen has said that a new member reads the history first. */
  setMembers(channel: MessagingId, membership: Membership): Promise<ChannelResult> {
    return this.messaging.setMembers(channel, membership.members, membership.lead);
  }

  /** The person joins a channel from Browse channels. */
  join(channel: MessagingId): Promise<ChannelResult> {
    return this.messaging.joinChannel(channel);
  }

  /** The person leaves a channel, once they said so. */
  leave(channel: MessagingId): Promise<ChannelResult> {
    return this.messaging.leaveChannel(channel);
  }
}
