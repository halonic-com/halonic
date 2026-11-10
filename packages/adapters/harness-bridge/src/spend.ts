import type { Usage } from "@halonicjs/events";
import { type BridgeProvider, bridgeCallCharge, type HarnessBridgeOptions } from "@halonicjs/ports";
import { isPlainObject, KindedError } from "@halonicjs/std";
import type { ReplyWatcher } from "./pass-through.ts";

/** What the bridge knows of a model call before it goes out. */
export interface ModelCall {
  provider: BridgeProvider;
  /** The model the request names, as `models.yaml` prices it. */
  model: string;
  /** How many messages the request sends. */
  messages: number;
}

/** What a reply reader found in a provider's reply. */
export interface ReplyReading {
  usage: Usage;
  /** The model's text answer, as far as the reply got. */
  text: string;
}

/** Watches a provider's reply as it passes through, and tells what the call used. */
export interface ReplyReader extends ReplyWatcher {
  /** What the reply said the call used, or `undefined` when it said nothing, as an error reply doesn't. */
  reading(): ReplyReading | undefined;
}

/**
 * The model and the number of messages of a model request, which both
 * providers name with `model` and `messages`. `request` is the body already
 * parsed, as `parseModelRequest` gives it.
 *
 * @throws KindedError `invalid_input` when the request names no model
 */
export function readModelCall(provider: BridgeProvider, request: unknown): ModelCall {
  if (!isPlainObject(request) || typeof request["model"] !== "string") {
    throw new KindedError("invalid_input", "The model request doesn't name a model.");
  }
  const messages = request["messages"];
  return {
    provider,
    model: request["model"],
    messages: Array.isArray(messages) ? messages.length : 0,
  };
}

/**
 * Makes one model call with `send` and records it through the run's
 * recorder, as the built-in loop does (requirement `harness-bridge.spend`):
 * `llm.request` before the call goes out, and `llm.response` with its usage
 * and cost once the reply has ended. A reply cut short still records what
 * its usage said so far, because the provider charges for it. A reply that
 * said no usage, such as an error reply, records no `llm.response`.
 */
export async function recordModelCall(
  run: HarnessBridgeOptions,
  call: ModelCall,
  reply: ReplyReader,
  send: () => Promise<void>,
): Promise<void> {
  const { provider, model } = call;
  await run.recorder.record({
    type: "llm.request",
    agent: run.agentId,
    provider,
    model,
    messages: call.messages,
  });
  const started = performance.now();
  try {
    await send();
  } finally {
    const read = reply.reading();
    if (read !== undefined) {
      await run.recorder.record({
        type: "llm.response",
        agent: run.agentId,
        provider,
        model,
        usage: read.usage,
        latencyMs: Math.round(performance.now() - started),
        text: read.text,
        ...callCharge(run, call, read.usage),
      });
    }
  }
}

/** The `cost` and `paidBy` of a call: the price is asked for only when a key pays. */
function callCharge(run: HarnessBridgeOptions, call: ModelCall, usage: Usage) {
  const access = run.providers[call.provider];
  if (access === undefined) {
    throw new KindedError(
      "internal",
      `The bridge called ${call.provider} for an agent that doesn't use it.`,
    );
  }
  const price = access.kind === "key" ? run.price(call.provider, call.model) : null;
  return bridgeCallCharge(access, price, usage);
}
