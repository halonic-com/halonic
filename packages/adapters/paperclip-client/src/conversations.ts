import {
  addresseesFit,
  type Conversation,
  type MessagingId,
  type MessagingRefusal,
} from "@halonicjs/ports";
import { readChannel, toChannel } from "./channels.ts";
import { readWorkingChats, withAgentWorking } from "./chat-signals.ts";
import type { PaperclipIds } from "./ids.ts";
import { asRecords, type JsonRecord, text } from "./json.ts";
import { type MapContext, newestFirst, toConversation } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import { bodyOf } from "./transport.ts";

/** The person's chats in `company`, as Paperclip lists them. */
export async function readChats(
  reader: PaperclipReader,
  company: string,
): Promise<readonly JsonRecord[]> {
  const answer = await reader.send("listChats", { path: { company } });
  // Paperclip answers 404 when Agent Chat is off: there are no chats, which isn't an error.
  return answer.kind === "failed" && answer.failure === "not-found"
    ? []
    : asRecords(bodyOf("listChats", answer));
}

/**
 * Reads the person's chats and channels, and remembers each chat task's agent as last read, for
 * its messages' `readAt`.
 */
export class PaperclipConversations {
  readonly #reader: PaperclipReader;
  readonly #ids: PaperclipIds;
  readonly #company: string;
  /** The user the host named; reading it from Paperclip here is HAL-18736's follow-up. */
  readonly #userId: string | undefined;
  #chatAgents = new Map<string, string>();

  constructor(
    reader: PaperclipReader,
    ids: PaperclipIds,
    { company, userId }: { company: string; userId?: string | undefined },
  ) {
    this.#reader = reader;
    this.#ids = ids;
    this.#company = company;
    this.#userId = userId;
  }

  /** Chat task `task`'s agent, as the chats were last read. */
  agentOf(task: string): string | undefined {
    return this.#chatAgents.get(task);
  }

  /**
   * The person's chats and the channels among `tasks`, newest first. `chatList` is the chat list
   * when the caller already read it in this poll, so one poll reads it once.
   */
  async list(
    context: MapContext,
    tasks: readonly JsonRecord[],
    chatList?: readonly JsonRecord[],
  ): Promise<Conversation[]> {
    // A channel the person left shows in Browse instead.
    const channels = tasks.flatMap((record) => {
      const userId = this.#userId;
      const channel = readChannel(record, userId);
      const left = userId !== undefined && !channel?.people.includes(userId);
      return channel === undefined || left ? [] : [toChannel(context, channel)];
    });
    const records = chatList ?? (await readChats(this.#reader, this.#company));
    this.#chatAgents = new Map(
      records.flatMap((record) => {
        const [task, agent] = [text(record, "id"), text(record, "conversationAgentId")];
        return task === undefined || agent === undefined ? [] : [[task, agent] as const];
      }),
    );
    // Live runs are read only when there are chats to mark (`paperclip-client.agent-working`).
    const working =
      records.length === 0 ? undefined : await readWorkingChats(this.#reader, this.#company);
    const chats = records.flatMap((record) => {
      const chat = toConversation(context, record);
      return chat === undefined ? [] : [withAgentWorking(this.#ids, chat, working)];
    });
    return newestFirst([...chats, ...channels], (conversation) => conversation.updatedAt);
  }

  /**
   * Why `task` can't take a message: offline, signed out, not one of the person's chats, or a `to`
   * naming an agent other than the chat's one agent.
   */
  async refusalUnlessChat(
    context: MapContext,
    task: string,
    to: readonly MessagingId[],
  ): Promise<MessagingRefusal | undefined> {
    const answer = await this.#reader.send("listChats", { path: { company: this.#company } });
    if (answer.kind === "failed") {
      const { failure } = answer;
      if (failure === "offline" || failure === "signed-out" || failure === "not-found") {
        return failure;
      }
    }
    const chats = asRecords(bodyOf("listChats", answer));
    const chat = chats.find((each) => text(each, "id") === task);
    if (chat === undefined) return "not-found";
    if (to.length === 0) return undefined;
    const conversation = toConversation(context, chat);
    return conversation !== undefined && addresseesFit(conversation, to) ? undefined : "not-found";
  }
}
