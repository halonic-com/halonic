import {
  addresseesFit,
  type MessageWork,
  type MessagingId,
  type MessagingRefusal,
  type SendResult,
} from "@halonicjs/ports";
import {
  type ChannelTask,
  childTaskDescription,
  childTaskTitle,
  readChannel,
  toChannel,
} from "./channels.ts";
import { asRecord, type JsonRecord, text } from "./json.ts";
import { type MapContext, toMessage } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import { PaperclipClientError } from "./transport.ts";
import { refusalOf } from "./writer.ts";

/** A channel found, or why it can't be used. */
export type FoundChannel =
  | { kind: "found"; channel: ChannelTask }
  | { kind: "refused"; reason: MessagingRefusal };

/** Parent task `task` as a channel of company `company`, or why it can't take a write. */
export async function findChannel(
  reader: PaperclipReader,
  company: string,
  userId: string | undefined,
  task: string,
): Promise<FoundChannel> {
  const answer = await reader.send("getTask", { path: { task } });
  const reason = refusalOf(answer);
  if (reason !== undefined) {
    return { kind: "refused", reason };
  }
  const record: JsonRecord | undefined = answer.kind === "ok" ? asRecord(answer.body) : undefined;
  const channel =
    record === undefined || text(record, "companyId") !== company
      ? undefined
      : readChannel(record, userId);
  return channel === undefined || channel.id !== task
    ? { kind: "refused", reason: "not-found" }
    : { kind: "found", channel };
}

function refused(reason: MessagingRefusal): SendResult {
  return { outcome: "refused", reason };
}

/**
 * Sends the person's messages in a channel, mapped as K1 (`paperclip-client.channels`): the
 * message is a comment on the channel's parent task, and each agent in `to`, or the lead when
 * `to` is empty, gets one child task assigned to it. Only that assignment wakes an agent: the
 * provider never reads a name out of the text, so `@Bo` typed in a message wakes nobody.
 */
export class PaperclipChannelSender {
  readonly #reader: PaperclipReader;
  readonly #company: string;
  readonly #userId: string | undefined;
  readonly #now: () => Date;

  constructor(
    reader: PaperclipReader,
    company: string,
    userId: string | undefined,
    now: () => Date,
  ) {
    this.#reader = reader;
    this.#company = company;
    this.#userId = userId;
    this.#now = now;
  }

  /** Sends `body` in channel `task` to the agents in `to`, or to its lead. */
  async send(
    context: MapContext,
    task: string,
    body: string,
    to: readonly MessagingId[],
  ): Promise<SendResult> {
    const found = await findChannel(this.#reader, this.#company, this.#userId, task);
    if (found.kind === "refused") {
      return refused(found.reason);
    }
    const channel = found.channel;
    const conversation = toChannel(context, channel);
    const addressees = to.length === 0 ? [conversation.agent] : to;
    const agents = addressees.map((agent) => context.ids.read(agent, "agent")?.[0]);
    if (!addresseesFit(conversation, addressees) || agents.includes(undefined)) {
      return refused("not-found");
    }
    const sent = await this.#reader.send("commentOnChannel", {
      path: { task },
      body: { body, clientRequestId: crypto.randomUUID() },
    });
    const reason = refusalOf(sent);
    if (reason !== undefined) {
      return refused(reason);
    }
    const record = sent.kind === "ok" ? asRecord(sent.body) : undefined;
    const message = record === undefined ? undefined : toMessage(context, task, record);
    const comment = text(record, "id");
    if (message === undefined || comment === undefined) {
      throw new PaperclipClientError(
        "Paperclip refused POST commentOnChannel, or its answer holds no comment.",
        "bad-answer",
      );
    }
    const work: MessageWork[] = [];
    for (const [index, agent] of agents.entries()) {
      const line = await this.#ask(context, channel, agent ?? "", body, comment);
      work.push({ ...line, agent: addressees[index] ?? "" });
    }
    return {
      outcome: "sent",
      message: { ...message, conversation: conversation.id, to: addressees, work },
    };
  }

  /**
   * Opens one child task for `agent`, assigned to it, carrying only the person's text. A child
   * task that couldn't be made is a `failed` line: the message itself was already sent.
   */
  async #ask(
    context: MapContext,
    channel: ChannelTask,
    agent: string,
    body: string,
    comment: string,
  ): Promise<Omit<MessageWork, "agent">> {
    const since = this.#now().toISOString();
    const created = await this.#reader.send("createChildTask", {
      path: { company: this.#company },
      body: {
        title: childTaskTitle(channel.title, body),
        description: childTaskDescription(channel.title, body, comment),
        parentId: channel.id,
        assigneeAgentId: agent,
        status: "todo",
      },
    });
    const child = text(created.kind === "ok" ? asRecord(created.body) : undefined, "id");
    if (child === undefined) {
      // Paperclip's own reason, when it gave one, so the line can say why (HAL-17514, k11b).
      const reason = created.kind === "failed" ? created.detail : undefined;
      return { state: "failed", since, ...(reason === undefined ? {} : { reason }) };
    }
    return { state: "starting", work: context.ids.make("task", child), since };
  }
}
