import type { PluginSecretsClient } from "@paperclipai/plugin-sdk";
import { type CallUsage, tokenCount } from "../front-bot/limits.ts";
import type { FrontBotReason } from "../front-bot/log-record.ts";
import { type FrontBotAnswer, parseFrontBotAnswer } from "../front-bot/prompt.ts";
import { type RunKind, splitRunLine } from "../front-bot/run-choice.ts";
import type { SecretRef } from "../task-effort/settings.ts";

/**
 * The front bot's one call outside the plugin host (HAL-19136): Anthropic's
 * Messages API with the bot's own key. It logs nothing and returns no error
 * text, only a fixed code, so neither the key nor a raw error body can reach
 * a log (HAL-18847 section 4.3).
 */

/** What the bot reaches outside the host, so tests replace it with recorded replies. */
export interface FrontBotDeps {
  /**
   * Node's own `fetch`, not `ctx.http.fetch`: the host's drops `signal` and
   * `redirect`, so a hanging call would run to its 30 s RPC limit. Only ever
   * called with {@link messagesUrl}.
   */
  readonly anthropicFetch: typeof fetch;
  readonly now: () => Date;
}

/** The only address the bot calls (HAL-18847 section 4.4). */
export const messagesUrl = "https://api.anthropic.com/v1/messages";

/** A first reply or note is only worth it within seconds; a slower answer is dropped. */
const requestTimeoutMs = 8_000;

/**
 * Runs `work` with a signal that aborts after `ms`, and gives up waiting at
 * that point even if `work` ignores the signal, so a hanging call never holds
 * the bot's queue past the limit.
 */
export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T | "timeout"> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** What one call came to. */
export type FrontBotCall =
  | {
      readonly answered: true;
      readonly answer: FrontBotAnswer;
      /** Whether the message is a quick question (front bot v2); `normal` when not asked. */
      readonly run: RunKind;
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

/** One Messages API call and its answer read. Throws on a network failure. */
async function callMessages(
  deps: FrontBotDeps,
  key: string,
  request: Record<string, unknown>,
  runChoice: boolean,
  signal: AbortSignal,
): Promise<FrontBotCall> {
  const response = await deps.anthropicFetch(messagesUrl, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
    // A redirect would take the key header to another host.
    redirect: "error",
    signal,
  });
  if (!response.ok) {
    return { answered: false, reason: `http_${response.status}` };
  }
  const body = (await response.json()) as {
    content?: { type?: string; text?: string }[];
    usage?: CallUsage;
  };
  const { reply, run } = splitRunLine(answerText(body));
  return {
    answered: true,
    answer: parseFrontBotAnswer(reply),
    run: runChoice ? run : "normal",
    inputTokens: tokenCount(body.usage?.input_tokens),
    outputTokens: tokenCount(body.usage?.output_tokens),
    usage: body.usage,
  };
}

/**
 * Sends one request (a first reply's or a progress note's) to Haiku, giving
 * up after {@link requestTimeoutMs}. With `runChoice`, the first reply also
 * says whether the run is quick. Never throws.
 */
export async function askFrontBot(
  ctx: { readonly secrets: Pick<PluginSecretsClient, "resolve"> },
  deps: FrontBotDeps,
  keyRef: SecretRef,
  companyId: string,
  request: Record<string, unknown>,
  runChoice = false,
): Promise<FrontBotCall> {
  try {
    // Read at call time, sent only to Anthropic in a header, never logged or kept.
    const key = await ctx.secrets.resolve(keyRef, { companyId });
    const call = await withTimeout(
      (signal) => callMessages(deps, key, request, runChoice, signal),
      requestTimeoutMs,
    );
    return call === "timeout" ? { answered: false, reason: "timeout" } : call;
  } catch (error) {
    return { answered: false, reason: failureReason(error) };
  }
}
