import type { ProviderRouting, Usage } from "@halonicjs/events";
import {
  type BridgeEffort,
  type BridgeProvider,
  type BridgeProviderAccess,
  bridgeCallCharge,
  type HarnessBridgeOptions,
} from "@halonicjs/ports";
import { isPlainObject, KindedError } from "@halonicjs/std";
import { effortFor } from "./effort.ts";
import { routingFor } from "./openrouter-routing.ts";
import type { PassedReply, ReplyWatcher } from "./pass-through.ts";
import type { BridgeRequestContext } from "./route.ts";

/** What the bridge knows of a model call before it goes out. */
export interface ModelCall {
  provider: BridgeProvider;
  /** The model the request names, as `models.yaml` prices it. */
  model: string;
  /** How many messages the request sends. */
  messages: number;
  /** The effort the host set for the model, which the bridge sends in place of the program's. */
  effort?: BridgeEffort;
  /** Set when a sub-agent of the program made the call, as `withSubagent` finds it. */
  subagent?: string;
  /** The alias's OpenRouter host pin, which the bridge sends as the request's `provider`. */
  routing?: ProviderRouting;
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
 * The model and the number of messages of a model request. Both providers
 * name the model with `model`; the messages are in `messagesField`, such as
 * Anthropic's `messages` or OpenAI's `input`, where a plain text prompt
 * counts as one message. `request` is the body already parsed, as
 * `parseModelRequest` gives it. The effort is the one `access` names for
 * the model, if any (requirement `harness-bridge.effort`), and the routing
 * the one it names for OpenRouter (requirement `harness-bridge.openrouter-routing`).
 *
 * @throws KindedError `invalid_input` when the request names no model
 */
export function readModelCall(
  provider: BridgeProvider,
  request: unknown,
  messagesField: "messages" | "input",
  access: BridgeProviderAccess,
): ModelCall {
  if (!isPlainObject(request) || typeof request["model"] !== "string") {
    throw new KindedError("invalid_input", "The model request doesn't name a model.");
  }
  const model = request["model"];
  const effort = effortFor(access, model);
  const routing = routingFor(access);
  return {
    provider,
    model,
    messages: countMessages(request[messagesField]),
    ...(effort === undefined ? {} : { effort }),
    ...(routing === undefined ? {} : { routing }),
  };
}

/** How many messages `messages` holds: each item of a list, or one for a plain text prompt. */
function countMessages(messages: unknown): number {
  if (Array.isArray(messages)) return messages.length;
  return typeof messages === "string" ? 1 : 0;
}

/**
 * Makes one model call with `send` and records it through the run's
 * recorder, as the built-in loop does (requirement `harness-bridge.spend`):
 * `llm.request` before the call goes out, and `llm.response` with its usage
 * and cost once the reply has ended. The reply goes back to the program
 * right away; the `llm.response` is recorded through
 * {@link BridgeRequestContext.afterReply} once its body has ended. A reply
 * cut short still records what its usage said so far, because the provider
 * charges for it. A reply that said no usage, such as an error reply,
 * records no `llm.response`.
 */
export async function recordModelCall(
  context: BridgeRequestContext,
  call: ModelCall,
  reply: ReplyReader,
  send: () => Promise<PassedReply>,
): Promise<Response> {
  const { run } = context;
  const { model } = call;
  const provider = providerNamed(run, call);
  // On both events, so the roll-up can read either (requirement `harness-bridge.subagent-calls`).
  const subagent = call.subagent === undefined ? {} : { subagent: call.subagent };
  await run.recorder.record({
    type: "llm.request",
    agent: run.agentId,
    provider,
    model,
    ...(call.effort === undefined ? {} : { effort: call.effort }),
    ...subagent,
    ...(call.routing === undefined ? {} : { routing: call.routing }),
    messages: call.messages,
  });
  const started = performance.now();
  const recordReply = async () => {
    const read = reply.reading();
    if (read === undefined) return;
    await run.recorder.record({
      type: "llm.response",
      agent: run.agentId,
      provider,
      model,
      usage: read.usage,
      latencyMs: Math.round(performance.now() - started),
      text: read.text,
      ...subagent,
      ...callCharge(run, call, read.usage),
    });
  };
  let passed: PassedReply;
  try {
    passed = await send();
  } catch (error) {
    await recordReply();
    throw error;
  }
  context.afterReply(passed.ended.then(recordReply));
  return passed.response;
}

/**
 * The provider the run log names for a call: the provider file the key
 * comes from, such as `zai`, when the host names it, else the API's own
 * name (requirement `harness-bridge.provider-base-url`).
 */
function providerNamed(run: HarnessBridgeOptions, call: ModelCall): string {
  const access = run.providers[call.provider];
  return access?.kind === "key" && access.providerId !== undefined
    ? access.providerId
    : call.provider;
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
