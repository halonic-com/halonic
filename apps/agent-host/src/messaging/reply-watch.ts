import { pollRates } from "@halonicjs/host-paperclip-sync";
import type { AgentMessaging, Clock, Conversation, MessagingId } from "@halonicjs/ports";

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
  /** Reports a read of the conversation list that failed; the conversations in it are then no longer watched. */
  report: (error: unknown) => void;
}

/**
 * The conversations the person sent to and whose agent hasn't answered yet,
 * for the sync's fast polls (requirement `agent-host.paperclip-polling`).
 * Each check is one read of the conversation list, never of a conversation's
 * messages, so a fast poll costs the source a list read and nothing more: a
 * conversation waits for its agent while its agent is working on it, or until
 * the agent has answered and the person is next. One that no longer waits, or
 * was sent to more than 3 minutes ago, is no longer watched.
 *
 * @example
 * const replies = new ReplyWatch({ clock, report });
 * const sync = new SyncScheduler({ scheduler, clock, poll, waiting: () => replies.waiting() });
 * replies.watch(messaging, conversation);
 * await sync.expectReply();
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
    const since = this.#clock.now().getTime() - pollRates.waitingForMs;
    const recent = this.#watched.filter((each) => each.sentAt > since);
    const messagings = [...new Set(recent.map((each) => each.messaging))];
    // One list read per messaging, however many of its conversations are watched.
    const lists = new Map(
      await Promise.all(
        messagings.map(
          async (messaging) => [messaging, await this.#conversations(messaging)] as const,
        ),
      ),
    );
    const done = new Set(
      recent.filter((each) => !waitsForAgent(lists.get(each.messaging) ?? [], each.conversation)),
    );
    // A send that came while the reads ran stays watched: only what was read and done, or too old, goes.
    this.#watched = this.#watched.filter((each) => each.sentAt > since && !done.has(each));
    return this.#watched.length > 0;
  }

  /** The messaging's conversations; a read that fails is reported and reads as none. */
  async #conversations(messaging: AgentMessaging): Promise<readonly Conversation[]> {
    try {
      return await messaging.listConversations();
    } catch (error) {
      this.#report(error);
      return [];
    }
  }
}

/**
 * Whether conversation `conversation` in `conversations` waits for its agent:
 * the agent is working on it, or the agent hasn't answered since the person
 * wrote (it isn't {@link Conversation.waitingForMe}). A conversation the list
 * no longer holds waits for nobody.
 */
export function waitsForAgent(
  conversations: readonly Conversation[],
  conversation: MessagingId,
): boolean {
  const found = conversations.find((each) => each.id === conversation);
  if (found === undefined) return false;
  return found.agentWorking === true || !found.waitingForMe;
}
