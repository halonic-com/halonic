import type { ChatResponse } from "@halonicjs/ports";

/**
 * One scripted reply. Text answers as it is, or calls tools when every line
 * is a tool line. A whole answer is given back exactly, with its own usage,
 * finish reason and tool call ids. `{ refuse }` fails the call as a provider
 * that turns it down; `{ hang: true }` keeps the call open until its signal
 * aborts.
 */
export type MockReply =
  | string
  | Omit<ChatResponse, "replay">
  | { readonly refuse: string }
  | { readonly hang: true };

/**
 * A mock model's script: for each agent id, the replies it gives in order.
 * The key `*` holds the replies for agents that have no script of their own.
 *
 * @example
 * const script: MockScript = { writer: ["A first draft", "tool:search {\"q\":\"refund\"}"] };
 */
export type MockScript = Readonly<Record<string, readonly MockReply[]>>;

/** The script key whose replies go to every agent without its own script. */
export const anyAgent = "*";

/** The replies still to be given, one queue per script key, used up in order. */
export class ReplyQueues {
  private readonly queues: Map<string, MockReply[]>;

  constructor(script: MockScript) {
    this.queues = new Map(
      Object.entries(script).map(([agentId, replies]) => [agentId, [...replies]]),
    );
  }

  /**
   * The next scripted reply for an agent, or undefined when there is none.
   *
   * An agent with its own script uses only that script: once it runs out, the
   * agent gets no reply from `*`. The old mock behaved this way, and the
   * recorded event logs depend on it.
   */
  next(agentId: string): MockReply | undefined {
    const queue = this.queues.get(agentId) ?? this.queues.get(anyAgent);
    return queue?.shift();
  }

  /** How many replies are left for each script key, so a test can check it used its whole script. */
  remaining(): Record<string, number> {
    return Object.fromEntries(
      [...this.queues].map(([agentId, replies]) => [agentId, replies.length]),
    );
  }
}
