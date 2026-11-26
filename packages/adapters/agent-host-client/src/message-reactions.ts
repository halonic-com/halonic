import type {
  MessageReactions,
  MessagingId,
  ReactionEmoji,
  ReactionsRead,
  ReactResult,
} from "@halonicjs/ports";
import { parse, s } from "@halonicjs/schema-kit";
import { type AgentHostAnswer, type AgentHostTransport, readAnswer } from "./transport.ts";

const resultAnswer = s.object({ result: s.object({ outcome: s.string() }).passthrough() }).strict();
const routeMissing = s.object({ error: s.object({ kind: s.enum(["not_found"]) }).passthrough() });

const notSupported = { outcome: "refused", reason: "not-supported" } as const;

/**
 * The desktop engine's message reactions for one workspace
 * (`agent-host-client.message-reactions`, HAL-19139), through the agent host,
 * which sends them to each conversation's own source. A host older than the
 * reaction routes answers 404 `not_found`; that reads as `not-supported`, so
 * Studio shows the chat without reactions instead of failing it. Studio
 * provides it as `MessageReactionsService`.
 *
 * @example
 * const reactions = new AgentHostReactions(transport, "/work/acme");
 * const read = await reactions.list("paperclip:acme:chat:task-1");
 */
export class AgentHostReactions implements MessageReactions {
  readonly #transport: AgentHostTransport;
  readonly #workspace: string;

  constructor(transport: AgentHostTransport, workspace: string) {
    this.#transport = transport;
    this.#workspace = workspace;
  }

  async list(conversation: MessagingId): Promise<ReactionsRead> {
    const route = "POST /v1/messaging/reactions";
    const answer = await this.#transport.request(route, {
      workspace: this.#workspace,
      conversation,
    });
    if (isRouteMissing(answer)) return notSupported;
    return readAnswer(route, answer, resultAnswer).result as ReactionsRead;
  }

  async react(message: MessagingId, emoji: ReactionEmoji, on: boolean): Promise<ReactResult> {
    const route = "POST /v1/messaging/react";
    const body = { workspace: this.#workspace, message, emoji, on };
    const answer = await this.#transport.request(route, body);
    if (isRouteMissing(answer)) return notSupported;
    return readAnswer(route, answer, resultAnswer).result as ReactResult;
  }
}

/** Whether the host answered that it doesn't serve the route at all: a host older than reactions. */
function isRouteMissing(answer: AgentHostAnswer): boolean {
  return answer.status === 404 && parse(routeMissing, answer.body).ok;
}
