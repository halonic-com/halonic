import { type Conversation, channelMembersMax, channelMembersMin } from "@halonicjs/ports";
import { asList, asRecord, field, type JsonRecord, text } from "./json.ts";
import { type MapContext, timeOf } from "./map.ts";
import { isSafeSegment } from "./requests.ts";

/**
 * The tag on a channel's parent task. The agent-tools plugin's hand-off limit
 * (D3, HAL-17628) reads the same tag, without regard to case or spaces.
 */
export const channelTag = "channel";

/** A channel as its parent task holds it, in Paperclip's own IDs. */
export interface ChannelTask {
  id: string;
  title: string;
  lead: string;
  members: readonly string[];
  updatedAt: string;
}

// The members line the provider writes into the parent's description, on a line of its own.
// A quoted line ("> …") never matches, so text of the person's can't pass for it.
const membersLine = /^<!-- halonic-channel (\{[^\n]*\}) -->$/m;

/** The members line for a parent task's description, which `readChannel` reads back. */
export function channelMembersLine(members: readonly string[], lead: string): string {
  return `<!-- halonic-channel ${JSON.stringify({ lead, members })} -->`;
}

/** Whether a task carries the channel tag. */
function hasChannelTag(record: JsonRecord): boolean {
  return asList(field(record, "labels")).some(
    (label) => text(asRecord(label), "name")?.trim().toLowerCase() === channelTag,
  );
}

/**
 * Whether a person made the task, never an agent: the provider makes a channel's parent with
 * the person's key, so an agent that tags its own task makes no channel. With the key's user
 * known, it must be that person.
 */
function madeByThePerson(record: JsonRecord, userId: string | undefined): boolean {
  const creator = text(record, "createdByUserId");
  const agentMade = text(record, "createdByAgentId") !== undefined;
  return !agentMade && creator !== undefined && (userId === undefined || creator === userId);
}

/** The lead and members from a members line, when they make a channel; otherwise `undefined`. */
function parseMembers(description: string): { lead: string; members: string[] } | undefined {
  const match = membersLine.exec(description)?.[1];
  let parsed: unknown;
  try {
    parsed = match === undefined ? undefined : JSON.parse(match);
  } catch {
    // A broken line makes no channel; the task still shows as work.
    return undefined;
  }
  const record = asRecord(parsed);
  const lead = text(record, "lead");
  const members = asList(field(record, "members")).filter(
    (member): member is string => typeof member === "string" && isSafeSegment(member),
  );
  const fits =
    members.length >= channelMembersMin &&
    members.length <= channelMembersMax &&
    new Set(members).size === members.length;
  return lead !== undefined && fits && members.includes(lead) ? { lead, members } : undefined;
}

/**
 * Task `record` as a channel, or `undefined` when it isn't one: it must carry the channel tag,
 * be made by the person, not an agent, and hold a members line of 2 to 8 agents, the lead among
 * them (`paperclip-client.channels`).
 */
export function readChannel(
  record: JsonRecord,
  userId: string | undefined,
): ChannelTask | undefined {
  const id = text(record, "id");
  if (id === undefined || !hasChannelTag(record) || !madeByThePerson(record, userId)) {
    return undefined;
  }
  const members = parseMembers(text(record, "description") ?? "");
  if (members === undefined) {
    return undefined;
  }
  return {
    id,
    title: text(record, "title") ?? "",
    ...members,
    updatedAt: timeOf(record, "updatedAt"),
  };
}

/** A channel as the port's conversation: its lead answers when the person names no one. */
export function toChannel(context: MapContext, channel: ChannelTask): Conversation {
  return {
    id: context.ids.make("channel", channel.id),
    source: context.ids.source(),
    agent: context.ids.make("agent", channel.lead),
    members: channel.members.map((member) => context.ids.make("agent", member)),
    title: channel.title,
    updatedAt: channel.updatedAt,
    waitingForMe: false,
  };
}

/** The longest child task title, so a long message doesn't make a long title. */
const titleLength = 80;

/** A child task's title: the channel's name and the start of the message's first line. */
export function childTaskTitle(channel: string, body: string): string {
  const firstLine = body.trim().split("\n")[0]?.trim() ?? "";
  const title = firstLine === "" ? channel : `${channel}: ${firstLine}`;
  return title.length <= titleLength ? title : `${title.slice(0, titleLength - 1)}…`;
}

/**
 * A child task's description: the person's text and nothing else, quoted and labelled as theirs
 * (Julian, HAL-17540), then the line that ties the task to the message it came from. Quoting
 * every line keeps the person's text from passing for the label or that line.
 */
export function childTaskDescription(channel: string, body: string, message: string): string {
  const quoted = body.split("\n").map((line) => (line === "" ? ">" : `> ${line}`));
  return [
    `The board wrote in the channel ${channel}:`,
    "",
    ...quoted,
    "",
    `<!-- halonic-channel-message ${message} -->`,
  ].join("\n");
}
