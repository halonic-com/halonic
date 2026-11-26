import type {
  AgentMessaging,
  InboxAnswer,
  MessageSendOptions,
  MessagingId,
  OutgoingAttachment,
} from "@halonicjs/ports";
import type { MessagingPorts } from "./messaging-api.ts";
import type { MessagingPollLoop } from "./messaging-poll-loop.ts";

/**
 * The messaging the routes serve over the server's poll loop (`server.messaging-rate`). The
 * lists answer from what the loop last read, so a client's read reaches no provider. A
 * conversation's messages, a search and an attachment are read when a client asks: they
 * depend on what it asks for. Writes go straight to the source, and after each one the next
 * list read polls again, so the person sees what they just did.
 */
export class PolledMessaging implements AgentMessaging {
  readonly #loop: MessagingPollLoop;

  constructor(loop: MessagingPollLoop) {
    this.#loop = loop;
  }

  listSources() {
    return this.#loop.list("sources");
  }

  listAgents() {
    return this.#loop.list("agents");
  }

  listConversations() {
    return this.#loop.list("conversations");
  }

  listInboxItems() {
    return this.#loop.list("inboxItems");
  }

  listWork() {
    return this.#loop.list("work");
  }

  browseChannels() {
    return this.#loop.list("channels");
  }

  listMessages(conversation: MessagingId) {
    return this.#loop.source.listMessages(conversation);
  }

  search(text: string) {
    return this.#loop.source.search(text);
  }

  readAttachment(attachment: MessagingId) {
    return this.#loop.source.readAttachment(attachment);
  }

  changes(): AsyncIterable<MessagingId> {
    return this.#loop.source.changes();
  }

  answer(item: MessagingId, answer: InboxAnswer) {
    return this.#write(() => this.#loop.source.answer(item, answer));
  }

  send(
    conversation: MessagingId,
    body: string,
    attachments?: readonly OutgoingAttachment[],
    options?: MessageSendOptions,
  ) {
    return this.#write(() => this.#loop.source.send(conversation, body, attachments, options));
  }

  startChannel(title: string, members: readonly MessagingId[], lead: MessagingId) {
    return this.#write(() => this.#loop.source.startChannel(title, members, lead));
  }

  setMembers(channel: MessagingId, members: readonly MessagingId[], lead: MessagingId) {
    return this.#write(() => this.#loop.source.setMembers(channel, members, lead));
  }

  joinChannel(channel: MessagingId) {
    return this.#write(() => this.#loop.source.joinChannel(channel));
  }

  leaveChannel(channel: MessagingId) {
    return this.#write(() => this.#loop.source.leaveChannel(channel));
  }

  /** Runs a write, then makes the next list read poll again, whether the write went through or not. */
  async #write<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } finally {
      this.#loop.invalidate();
    }
  }
}

/** The routes' ports over one poll loop: its messaging and its focus. */
export function polledMessagingPorts(loop: MessagingPollLoop): MessagingPorts {
  return { port: new PolledMessaging(loop), focus: loop.focus };
}
