import type { ChatRequest } from "@halonicjs/ports";
import { type Infer, s } from "@halonicjs/schema-kit";
import { absolutePath } from "../sandbox/profile-schema.ts";

/** The most characters of message text one request may carry, over all its messages. */
export const maxMessageChars = 200_000;

/** The most messages one request may carry. */
export const maxMessages = 64;

/** The largest `maxTokens` a request may ask for; a request without one gets this. */
export const maxAnswerTokens = 4_096;

const text = s.string().min(1);

const message = s
  .object({ role: s.enum(["system", "user", "assistant"]), content: s.string() })
  .strict();

/**
 * One model call as the page may ask for it: text in, text out. It has no
 * tools, no `meta`, no signal and no sampling field the host doesn't
 * name, so the page can't widen what the host calls.
 */
const chatRequest = s
  .object({
    model: text,
    messages: s.array(message).min(1).max(maxMessages),
    params: s
      .object({
        maxTokens: s.number().int().positive().max(maxAnswerTokens).optional(),
        temperature: s.number().min(0).max(2).optional(),
      })
      .strict()
      .optional(),
    responseFormat: s.enum(["text", "json"]).optional(),
  })
  .strict();

/**
 * What Studio sends to run one chat call: the workspace folder and the
 * provider's id in it, which the host looks up in its own copy of the
 * workspace. The body never holds a provider's address, type or key.
 */
export const modelChatBody = s
  .object({ workspaceRoot: absolutePath, provider: text, request: chatRequest })
  .strict();

export type ModelChatBody = Infer<typeof modelChatBody>;

/** The characters of text in the request's messages. */
export function messageChars(request: ModelChatBody["request"]): number {
  return request.messages.reduce((total, each) => total + each.content.length, 0);
}

/** The request as the provider takes it, with `maxTokens` always set. */
export function chatRequestOf(request: ModelChatBody["request"]): ChatRequest {
  return {
    model: request.model,
    messages: request.messages,
    params: {
      maxTokens: request.params?.maxTokens ?? maxAnswerTokens,
      ...(request.params?.temperature === undefined
        ? {}
        : { temperature: request.params.temperature }),
    },
    ...(request.responseFormat === undefined ? {} : { responseFormat: request.responseFormat }),
  };
}
