import type { PluginSecretsClient } from "@paperclipai/plugin-sdk";
import { type CallUsage, tokenCount } from "../front-bot/limits.ts";
import type { FrontBotReason } from "../front-bot/log-record.ts";
import {
  type FrontBotAnswer,
  type FrontBotInput,
  frontBotRequest,
  parseFrontBotAnswer,
} from "../front-bot/prompt.ts";
import type { SecretRef } from "../task-effort/settings.ts";

/**
 * The front bot's one call outside the plugin host (HAL-19136): Anthropic's
 * Messages API with the bot's own key. It logs nothing and returns no error
 * text, only a fixed code, so neither the key nor a raw error body can reach
 * a log (HAL-18847 section 4.3).
 */

/** What the bot reaches outside the host, so tests replace it with recorded replies. */
export interface FrontBotDeps {
  /** The host's outbound `fetch`; only ever called with {@link messagesUrl}. */
  readonly anthropicFetch: typeof fetch;
  readonly now: () => Date;
}

/** The only address the bot calls (HAL-18847 section 4.4). */
export const messagesUrl = "https://api.anthropic.com/v1/messages";

/** A first reply is only worth it within seconds; a slower answer is dropped. */
const requestTimeoutMs = 8_000;

/** What one call came to. */
export type FrontBotCall =
  | {
      readonly answered: true;
      readonly answer: FrontBotAnswer;
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly usage: CallUsage | undefined;
    }
  | { readonly answered: false; readonly reason: FrontBotReason };

/** The fixed code for a thrown fetch: a timeout, or any other network failure. */
function failureReason(error: unknown): FrontBotReason {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
}

/** The text blocks of a Messages API answer, joined. */
function answerText(body: { content?: { type?: string; text?: string }[] }): string {
  return (body.content ?? [])
    .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
    .join("");
}

/** Asks Haiku for one first reply. Never throws. */
export async function askFrontBot(
  ctx: { readonly secrets: Pick<PluginSecretsClient, "resolve"> },
  deps: FrontBotDeps,
  keyRef: SecretRef,
  companyId: string,
  input: FrontBotInput,
): Promise<FrontBotCall> {
  try {
    // Read at call time, sent only to Anthropic in a header, never logged or kept.
    const key = await ctx.secrets.resolve(keyRef, { companyId });
    const response = await deps.anthropicFetch(messagesUrl, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(frontBotRequest(input)),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      return { answered: false, reason: `http_${response.status}` };
    }
    const body = (await response.json()) as {
      content?: { type?: string; text?: string }[];
      usage?: CallUsage;
    };
    return {
      answered: true,
      answer: parseFrontBotAnswer(answerText(body)),
      inputTokens: tokenCount(body.usage?.input_tokens),
      outputTokens: tokenCount(body.usage?.output_tokens),
      usage: body.usage,
    };
  } catch (error) {
    return { answered: false, reason: failureReason(error) };
  }
}
