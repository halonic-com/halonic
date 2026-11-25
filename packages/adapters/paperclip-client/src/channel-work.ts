import type { Message, MessageWork, MessageWorkState, MessagingId } from "@halonicjs/ports";
import { channelMessageOf, madeByThePerson } from "./channels.ts";
import { eachLimited } from "./inbox.ts";
import { asRecord, asRecords, field, type JsonRecord, text } from "./json.ts";
import { type MapContext, timeOf, toMessage } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";

/** How many of a channel's child tasks are read: one per agent each message went to. */
const childPage = "200";

/** How many child tasks are read at once. */
const childReadsAtOnce = 4;

/** How many of a child task's newest comments are read. */
const replyPage = "100";

const workLineStates: Readonly<Record<string, MessageWorkState>> = {
  backlog: "starting",
  todo: "starting",
  in_progress: "working",
  in_review: "working",
  done: "answered",
  cancelled: "failed",
};

/** A child task the person made for one agent's share of a message, in Paperclip's own IDs. */
interface ChannelChild {
  id: string;
  /** The comment on the channel's task, the person's message, that the child came from. */
  message: string;
  assignee: string | undefined;
  status: string;
  updatedAt: string;
}

/** What a channel's child tasks add to its messages. */
interface ChildRead {
  replies: Message[];
  /** The child's work lines, keyed by the person's message they belong under. */
  message: string;
  work: MessageWork[];
}

/**
 * Reads what became of the person's messages in a channel (`paperclip-client.channel-work`):
 * each message's child tasks give its work lines, and the agents' comments on them come back as
 * the agents' messages in the channel. It only reads: it posts nothing, so no agent's comment is
 * ever posted again anywhere.
 */
export class PaperclipChannelWork {
  readonly #reader: PaperclipReader;
  readonly #company: string;
  readonly #userId: string | undefined;

  constructor(reader: PaperclipReader, company: string, userId: string | undefined) {
    this.#reader = reader;
    this.#company = company;
    this.#userId = userId;
  }

  /**
   * `messages`, the comments on channel task `channel`, with work lines under the person's own
   * and the agents' replies from the child tasks added, oldest first.
   */
  async add(
    context: MapContext,
    channel: string,
    conversation: MessagingId,
    messages: readonly Message[],
  ): Promise<Message[]> {
    const mine = new Set(
      messages.flatMap((message) =>
        message.author.kind === "me"
          ? (context.ids.read(message.id, "comment")?.slice(1) ?? [])
          : [],
      ),
    );
    const children = (await this.#children(channel)).filter((child) => mine.has(child.message));
    // Each read keeps its child's place, so the lines come in the order Paperclip listed them.
    const reads: ChildRead[] = new Array(children.length);
    await eachLimited([...children.entries()], childReadsAtOnce, async ([index, child]) => {
      reads[index] = await this.#read(context, conversation, child);
    });
    const work = new Map<string, MessageWork[]>();
    for (const read of reads) {
      work.set(read.message, [...(work.get(read.message) ?? []), ...read.work]);
    }
    const withWork = messages.map((message) => {
      const comment = context.ids.read(message.id, "comment")?.[1];
      const lines = comment === undefined ? undefined : work.get(comment);
      return lines === undefined ? message : { ...message, work: lines };
    });
    const replies = reads.flatMap((read) => read.replies);
    return [...withWork, ...replies].sort((left, right) => left.sentAt.localeCompare(right.sentAt));
  }

  /** The child tasks of `channel` the person made, each tied to one of the person's messages. */
  async #children(channel: string): Promise<ChannelChild[]> {
    const listed = asRecords(
      await this.#reader.read("listTasks", {
        path: { company: this.#company },
        query: { parentId: channel, limit: childPage },
      }),
    );
    const children: ChannelChild[] = [];
    for (const record of listed) {
      const child = this.#child(await this.#whole(record), channel);
      if (child !== undefined) children.push(child);
    }
    return children;
  }

  /** `record` with its whole description: the list cuts long ones, and the message line is last. */
  async #whole(record: JsonRecord): Promise<JsonRecord> {
    const id = text(record, "id");
    if (field(record, "descriptionTruncated") !== true || id === undefined) {
      return record;
    }
    return asRecord(await this.#reader.read("getTask", { path: { task: id } })) ?? record;
  }

  /** `record` as a child task of `channel`, or `undefined` when it doesn't count. */
  #child(record: JsonRecord, channel: string): ChannelChild | undefined {
    const id = text(record, "id");
    const message = channelMessageOf(text(record, "description") ?? "");
    const counts =
      text(record, "parentId") === channel &&
      text(record, "companyId") === this.#company &&
      madeByThePerson(record, this.#userId);
    if (id === undefined || message === undefined || !counts) {
      return undefined;
    }
    return {
      id,
      message,
      assignee: text(record, "assigneeAgentId"),
      status: text(record, "status") ?? "",
      updatedAt: timeOf(record, "updatedAt"),
    };
  }

  /** One child task's work lines and the agents' replies on it. */
  async #read(
    context: MapContext,
    conversation: MessagingId,
    child: ChannelChild,
  ): Promise<ChildRead> {
    const comments = await this.#reader.read("listComments", {
      path: { task: child.id },
      query: { order: "desc", limit: replyPage },
    });
    const replies = asRecords(comments)
      .filter((record) => text(record, "authorAgentId") !== undefined)
      .flatMap((record) => toMessage(context, child.id, record) ?? [])
      .map((message) => ({ ...message, conversation }));
    const activity = asRecords(
      await this.#reader.read("listTaskActivity", { path: { task: child.id } }),
    );
    return { replies, message: child.message, work: workLines(context, child, activity) };
  }
}

/** One hand-off in a task's history: the agent it was assigned to, and the one it went to. */
interface HandOff {
  from: string;
  to: string;
  at: string;
}

/** The hand-off `record` records, when it is a task update from one agent to another. */
function handOffOf(record: JsonRecord): HandOff | undefined {
  const details = asRecord(field(record, "details"));
  const previous = text(asRecord(field(details, "_previous")), "assigneeAgentId");
  // Paperclip records the new assignee next to `_previous`, or in `patch` for a plugin's update.
  const next =
    text(details, "assigneeAgentId") ?? text(asRecord(field(details, "patch")), "assigneeAgentId");
  if (text(record, "action") !== "issue.updated" || previous === undefined || next === undefined) {
    return undefined;
  }
  return previous === next
    ? undefined
    : { from: previous, to: next, at: timeOf(record, "createdAt") };
}

/** A child task's work lines: one `passed-on` line per hand-off, oldest first, then where it stands. */
function workLines(
  context: MapContext,
  child: ChannelChild,
  activity: readonly JsonRecord[],
): MessageWork[] {
  const work = context.ids.make("task", child.id);
  const agent = (id: string) => context.ids.make("agent", id);
  const handOffs = activity
    .flatMap((record) => handOffOf(record) ?? [])
    .sort((left, right) => left.at.localeCompare(right.at));
  const lines: MessageWork[] = handOffs.map((handOff) => ({
    agent: agent(handOff.from),
    state: "passed-on",
    work,
    passedTo: agent(handOff.to),
    since: handOff.at,
  }));
  const holder = child.assignee ?? handOffs.at(-1)?.to;
  if (holder !== undefined) {
    const state = workLineStates[child.status] ?? "other";
    lines.push({ agent: agent(holder), state, work, since: child.updatedAt });
  }
  return lines;
}
