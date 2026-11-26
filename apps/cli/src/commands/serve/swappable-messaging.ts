// One `AgentMessaging` for the server's whole life, in front of messaging that `serve` makes
// again after a Paperclip sign-in or Disconnect (`cli.commands.serve.messaging-mount`). The
// server mounts its routes on one port when it starts, so the port stays and what is behind it
// is swapped.

import type {
  AgentMessaging,
  InboxAnswer,
  MessageSendOptions,
  MessagingId,
  OutgoingAttachment,
} from "@halonicjs/ports";

/** Hears a `changes` stream that stopped with an error; the reader goes on with the next one. */
export type ChangesFailed = (error: unknown) => void;

/**
 * Sends every call to the messaging of the moment. A `changes` reader keeps reading across a
 * swap: it stops reading the old messaging, hears the sources the swap changed, and reads the
 * new one, so a client never has to open the stream again.
 */
export class SwappableMessaging implements AgentMessaging {
  #current: AgentMessaging;
  readonly #readers = new Set<FollowedChanges>();
  readonly #failed: ChangesFailed;

  constructor(first: AgentMessaging, failed: ChangesFailed) {
    this.#current = first;
    this.#failed = failed;
  }

  /** Sends every later call to `next`, and names each source in `changed` to every reader. */
  swap(next: AgentMessaging, changed: readonly MessagingId[]): void {
    this.#current = next;
    for (const reader of this.#readers) reader.follow(next, changed);
  }

  listSources() {
    return this.#current.listSources();
  }

  listAgents() {
    return this.#current.listAgents();
  }

  listConversations() {
    return this.#current.listConversations();
  }

  listMessages(conversation: MessagingId) {
    return this.#current.listMessages(conversation);
  }

  listInboxItems() {
    return this.#current.listInboxItems();
  }

  listWork() {
    return this.#current.listWork();
  }

  search(text: string) {
    return this.#current.search(text);
  }

  answer(item: MessagingId, answer: InboxAnswer) {
    return this.#current.answer(item, answer);
  }

  readAttachment(attachment: MessagingId) {
    return this.#current.readAttachment(attachment);
  }

  send(
    conversation: MessagingId,
    body: string,
    attachments?: readonly OutgoingAttachment[],
    options?: MessageSendOptions,
  ) {
    return this.#current.send(conversation, body, attachments, options);
  }

  startChannel(title: string, members: readonly MessagingId[], lead: MessagingId) {
    return this.#current.startChannel(title, members, lead);
  }

  setMembers(channel: MessagingId, members: readonly MessagingId[], lead: MessagingId) {
    return this.#current.setMembers(channel, members, lead);
  }

  browseChannels() {
    return this.#current.browseChannels();
  }

  joinChannel(channel: MessagingId) {
    return this.#current.joinChannel(channel);
  }

  leaveChannel(channel: MessagingId) {
    return this.#current.leaveChannel(channel);
  }

  changes(): AsyncIterable<MessagingId> {
    return {
      [Symbol.asyncIterator]: () => {
        const reader = new FollowedChanges(this.#failed, () => this.#readers.delete(reader));
        this.#readers.add(reader);
        reader.follow(this.#current, []);
        return reader;
      },
    };
  }
}

/**
 * One reader's `changes`, read from one messaging at a time. A queue between them, so a slow
 * reader loses no change. When the reader stops, the messaging's stream is stopped too.
 */
class FollowedChanges implements AsyncIterableIterator<MessagingId> {
  readonly #failed: ChangesFailed;
  readonly #onLeave: () => void;
  #following: AsyncIterator<MessagingId> | undefined;
  #queued: MessagingId[] = [];
  #waiting: ((result: IteratorResult<MessagingId>) => void) | undefined;
  #left = false;

  constructor(failed: ChangesFailed, onLeave: () => void) {
    this.#failed = failed;
    this.#onLeave = onLeave;
  }

  /** Stops reading the messaging before, names `changed`, then reads `messaging`'s changes. */
  follow(messaging: AgentMessaging, changed: readonly MessagingId[]): void {
    this.#stopFollowing();
    for (const source of changed) this.#push(source);
    const following = messaging.changes()[Symbol.asyncIterator]();
    this.#following = following;
    this.#pump(following).catch((error: unknown) => this.#streamFailed(following, error));
  }

  next(): Promise<IteratorResult<MessagingId>> {
    const first = this.#queued.shift();
    if (first !== undefined) return Promise.resolve({ done: false, value: first });
    if (this.#left) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => {
      this.#waiting = resolve;
    });
  }

  return(): Promise<IteratorResult<MessagingId>> {
    this.#queued = [];
    this.#end();
    return Promise.resolve({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<MessagingId> {
    return this;
  }

  /**
   * Copies one messaging's stream into the queue until it ends or is no longer followed. A
   * change that arrives from a stream after a swap stopped following it is dropped: the swap
   * already named what it changed.
   */
  async #pump(following: AsyncIterator<MessagingId>): Promise<void> {
    while (!this.#left && this.#following === following) {
      const next = await following.next();
      if (next.done === true || this.#following !== following) return;
      this.#push(next.value);
    }
  }

  /**
   * The followed stream failed: the reader ends after the changes it already queued, instead of
   * waiting for a swap that may never come. A client must then open the stream again to keep
   * hearing changes. A stream a swap already left only reports its failure.
   */
  #streamFailed(following: AsyncIterator<MessagingId>, error: unknown): void {
    this.#failed(error);
    if (this.#following === following) this.#end();
  }

  /** Stops following, leaves the swaps, and answers a waiting `next` with the end. */
  #end(): void {
    this.#left = true;
    this.#stopFollowing();
    this.#onLeave();
    const waiting = this.#waiting;
    this.#waiting = undefined;
    waiting?.({ done: true, value: undefined });
  }

  #push(source: MessagingId): void {
    if (this.#left) return;
    const waiting = this.#waiting;
    if (waiting === undefined) {
      this.#queued.push(source);
      return;
    }
    this.#waiting = undefined;
    waiting({ done: false, value: source });
  }

  #stopFollowing(): void {
    const following = this.#following;
    this.#following = undefined;
    following?.return?.()?.catch(this.#failed);
  }
}
