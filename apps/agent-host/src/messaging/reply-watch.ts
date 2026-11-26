import type { AgentMessaging, Clock, MessagingId } from "@halonicjs/ports";
import { fastPollWindowMs } from "./messaging-poller.ts";

/** One conversation the person sent to, in the messaging that holds it. */
interface Watched {
  messaging: AgentMessaging;
  conversation: MessagingId;
  /** When the person sent, in milliseconds since 1970. */
  sentAt: number;
}

/** What a {@link ReplyWatch} needs: the time, and where a failed read is written. */
export interface ReplyWatchOptions {
  clock: Clock;
  /** Reports a read of a watched conversation that failed; the conversation is then no longer watched. */
  report: (error: unknown) => void;
}

/**
 * The conversations the person sent to and whose agent hasn't answered yet,
 * for the poller's fast reads (requirement `agent-host.paperclip-polling`).
 * Each is read from the messaging's cache, never from the source: a
 * conversation waits for its agent while its agent is working on it, or while
 * its last message that isn't automatic is the person's. One that no longer
 * waits, or was sent to more than 3 minutes ago, is no longer watched.
 *
 * @example
 * const replies = new ReplyWatch({ clock, report });
 * const poller = new MessagingPoller({ scheduler, clock, poll, waiting: () => replies.waiting() });
 * replies.watch(messaging, conversation);
 * await poller.expectReply();
 */
export class ReplyWatch {
  readonly #clock: Clock;
  readonly #report: (error: unknown) => void;
  #watched: Watched[] = [];

  constructor(options: ReplyWatchOptions) {
    this.#clock = options.clock;
    this.#report = options.report;
  }

  /** Watches a conversation the person just sent to, in place of an earlier watch of it. */
  watch(messaging: AgentMessaging, conversation: MessagingId): void {
    const others = this.#watched.filter(
      (each) => each.messaging !== messaging || each.conversation !== conversation,
    );
    const sentAt = this.#clock.now().getTime();
    this.#watched = [...others, { messaging, conversation, sentAt }];
  }

  /** Whether any watched conversation still waits for its agent. Never rejects. */
  async waiting(): Promise<boolean> {
    const since = this.#clock.now().getTime() - fastPollWindowMs;
    const recent = this.#watched.filter((each) => each.sentAt > since);
    const still = await Promise.all(recent.map((each) => this.#stillWaits(each)));
    const done = new Set(recent.filter((_, index) => !still[index]));
    // A send that came while the reads ran stays watched: only what was read and done, or too old, goes.
    this.#watched = this.#watched.filter((each) => each.sentAt > since && !done.has(each));
    return this.#watched.length > 0;
  }

  async #stillWaits(watched: Watched): Promise<boolean> {
    try {
      return await waitsForAgent(watched.messaging, watched.conversation);
    } catch (error) {
      this.#report(error);
      return false;
    }
  }
}

/**
 * Whether a conversation waits for its agent: the agent is working on it, or
 * its last message that isn't automatic is the person's. A conversation the
 * messaging no longer lists waits for nobody.
 */
export async function waitsForAgent(
  messaging: AgentMessaging,
  conversation: MessagingId,
): Promise<boolean> {
  const conversations = await messaging.listConversations();
  const found = conversations.find((each) => each.id === conversation);
  if (found === undefined) return false;
  if (found.agentWorking === true) return true;
  const messages = await messaging.listMessages(conversation);
  const last = messages.findLast((message) => message.automatic !== true);
  return last?.author.kind === "me";
}
