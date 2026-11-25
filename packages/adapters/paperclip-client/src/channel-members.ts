import {
  type ChannelResult,
  type Conversation,
  channelMembersMax,
  channelMembersMin,
  type MessagingId,
  type MessagingRefusal,
} from "@halonicjs/ports";
import { findChannel } from "./channel-send.ts";
import {
  type ChannelTask,
  channelMembersLine,
  channelTag,
  channelTitle,
  readChannel,
  toChannel,
  withMembersLine,
} from "./channels.ts";
import { asRecord, asRecords, type JsonRecord, text } from "./json.ts";
import { type MapContext, timeOf } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import { isSafeSegment, type PaperclipRequestName } from "./requests.ts";
import { bodyOf, type PaperclipAnswer, PaperclipClientError } from "./transport.ts";
import { refusalOf } from "./writer.ts";

/** The text above a new channel's members line. */
const channelIntro = "A channel in Halonic.";

/** A channel's agents, in Paperclip's IDs. */
interface ChannelAgents {
  members: string[];
  lead: string;
}

function refused(reason: MessagingRefusal): ChannelResult {
  return { outcome: "refused", reason };
}

function done(context: MapContext, channel: ChannelTask): ChannelResult {
  return { outcome: "done", conversation: toChannel(context, channel) };
}

/**
 * `members` and `lead` in Paperclip's IDs when they can make a channel: 2 to 8 of this
 * connection's agents, none twice, the lead among them. Checked before any request.
 */
function agentsOf(
  context: MapContext,
  members: readonly MessagingId[],
  lead: MessagingId,
): ChannelAgents | undefined {
  const ids = members.map((member) => context.ids.read(member, "agent")?.[0]);
  const [leadId] = context.ids.read(lead, "agent") ?? [];
  const agents = ids.filter((id): id is string => id !== undefined && isSafeSegment(id));
  const fits =
    agents.length === ids.length &&
    agents.length >= channelMembersMin &&
    agents.length <= channelMembersMax &&
    new Set(agents).size === agents.length &&
    leadId !== undefined &&
    agents.includes(leadId);
  return fits && leadId !== undefined ? { members: agents, lead: leadId } : undefined;
}

/** The record in a write's answer, or a thrown client error when Paperclip refused it otherwise. */
function recordOf(name: PaperclipRequestName, answer: PaperclipAnswer): JsonRecord {
  const record = asRecord(bodyOf(name, answer));
  if (record === undefined || text(record, "id") === undefined) {
    throw new PaperclipClientError(`Paperclip's answer to ${name} holds no ID.`, "bad-answer");
  }
  return record;
}

/**
 * Starts channels and changes who is in them, mapped as K1
 * (`paperclip-client.channel-membership`): a channel is a parent task the person makes with the
 * channel tag, unassigned, so a message on it wakes no agent; its members, lead and the people
 * who follow it are its members line. Paperclip has no followers on a task, so joining and
 * leaving change that line too. Nothing here adds, hires or changes an agent.
 */
export class PaperclipChannelMembers {
  readonly #reader: PaperclipReader;
  readonly #company: string;
  readonly #userId: string | undefined;

  constructor(reader: PaperclipReader, company: string, userId: string | undefined) {
    this.#reader = reader;
    this.#company = company;
    this.#userId = userId;
  }

  /** Makes the channel's parent task, followed by the person. */
  async start(
    context: MapContext,
    title: string,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    const agents = agentsOf(context, members, lead);
    if (agents === undefined) {
      return refused("bad-members");
    }
    const unknown = await this.#refusalUnlessListed(agents);
    if (unknown !== undefined) {
      return refused(unknown);
    }
    const label = await this.#channelLabel();
    if (label.kind === "refused") {
      return refused(label.reason);
    }
    const people = this.#userId === undefined ? undefined : [this.#userId];
    const line = channelMembersLine(agents.members, agents.lead, people);
    const description = `${channelIntro}\n\n${line}`;
    const created = await this.#reader.send("createChannel", {
      path: { company: this.#company },
      body: { title: channelTitle(title), description, labelIds: [label.id], status: "backlog" },
    });
    const reason = refusalOf(created);
    if (reason !== undefined) {
      return refused(reason);
    }
    const record = recordOf("createChannel", created);
    return done(context, {
      id: text(record, "id") ?? "",
      title: channelTitle(title),
      ...agents,
      people: people ?? [],
      description,
      updatedAt: timeOf(record, "updatedAt"),
    });
  }

  /** Rewrites channel `task`'s members line with these agents, and nothing else of the task. */
  async setMembers(
    context: MapContext,
    task: string,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    const agents = agentsOf(context, members, lead);
    if (agents === undefined) {
      return refused("bad-members");
    }
    const unknown = await this.#refusalUnlessListed(agents);
    if (unknown !== undefined) {
      return refused(unknown);
    }
    return this.#change(context, task, (channel) => ({ ...channel, ...agents }));
  }

  /** The person follows channel `task`, or stops following it. */
  async follow(context: MapContext, task: string, following: boolean): Promise<ChannelResult> {
    const person = this.#userId;
    if (person === undefined) {
      // Without the key's user there's no one to follow it as.
      return refused("not-supported");
    }
    return this.#change(context, task, (channel) => {
      const follows = channel.people.includes(person);
      if (following === follows) {
        return channel;
      }
      const people = following
        ? [...channel.people, person]
        : channel.people.filter((each) => each !== person);
      return { ...channel, people };
    });
  }

  /** The channels among `tasks` that the person made and doesn't follow. */
  browse(context: MapContext, tasks: readonly JsonRecord[]): Conversation[] {
    const person = this.#userId;
    if (person === undefined) {
      return [];
    }
    return tasks.flatMap((record) => {
      const channel = readChannel(record, person);
      return channel === undefined || channel.people.includes(person)
        ? []
        : [toChannel(context, channel)];
    });
  }

  /** Reads channel `task`, and writes `change`'s members line when it differs. */
  async #change(
    context: MapContext,
    task: string,
    change: (channel: ChannelTask) => ChannelTask,
  ): Promise<ChannelResult> {
    const found = await findChannel(this.#reader, this.#company, this.#userId, task);
    if (found.kind === "refused") {
      return refused(found.reason);
    }
    const changed = change(found.channel);
    const line = channelMembersLine(changed.members, changed.lead, changed.people);
    const description = withMembersLine(found.channel.description, line);
    if (description === found.channel.description) {
      return done(context, changed);
    }
    const answer = await this.#reader.send("updateChannel", {
      path: { task },
      body: { description },
    });
    const reason = refusalOf(answer);
    if (reason !== undefined) {
      return refused(reason);
    }
    bodyOf("updateChannel", answer);
    return done(context, { ...changed, description });
  }

  /** Why `agents` can't be a channel's: offline, signed out, or not all agents of the company. */
  async #refusalUnlessListed(agents: ChannelAgents): Promise<MessagingRefusal | undefined> {
    const answer = await this.#reader.send("listAgents", { path: { company: this.#company } });
    const reason = refusalOf(answer);
    if (reason !== undefined) {
      return reason;
    }
    const listed = new Set(asRecords(bodyOf("listAgents", answer)).map((each) => text(each, "id")));
    return agents.members.every((agent) => listed.has(agent)) ? undefined : "bad-members";
  }

  /** The ID of the company's `channel` tag, made when the company has none yet. */
  async #channelLabel(): Promise<
    { kind: "found"; id: string } | { kind: "refused"; reason: MessagingRefusal }
  > {
    const answer = await this.#reader.send("listLabels", { path: { company: this.#company } });
    const listed = refusalOf(answer);
    if (listed !== undefined) {
      return { kind: "refused", reason: listed };
    }
    const label = asRecords(bodyOf("listLabels", answer)).find(
      (each) => text(each, "name")?.trim().toLowerCase() === channelTag,
    );
    const known = text(label, "id");
    if (known !== undefined) {
      return { kind: "found", id: known };
    }
    const created = await this.#reader.send("createChannelLabel", {
      path: { company: this.#company },
      body: { name: channelTag, color: "#6366f1" },
    });
    const reason = refusalOf(created);
    if (reason !== undefined) {
      return { kind: "refused", reason };
    }
    return { kind: "found", id: text(recordOf("createChannelLabel", created), "id") ?? "" };
  }
}
