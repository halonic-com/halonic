import type { ProviderRouting } from "@halonicjs/events";
import {
  type BridgeProvider,
  type BridgeProviderAccess,
  bridgeRouting,
  type HarnessBridgeOptions,
  keepsDataTerms,
  maxBridgeFallbacks,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { isAtOpenRouter, routingFor } from "./openrouter-routing.ts";
import {
  type PassedReply,
  type StartedReply,
  startCall,
  type UpstreamCaller,
  type UpstreamRequest,
} from "./pass-through.ts";
import type { BridgeRequestContext } from "./route.ts";
import { type ModelCall, providerNamed, type ReplyReader, recordModelCall } from "./spend.ts";

/** One host pin a model call can go out on: the access's own first, then its fallbacks. */
export interface HostPin {
  alias?: string;
  routing?: ProviderRouting;
}

/** One try of a call on one host pin: the request to send, and the reader that watches its reply. */
export interface PinnedAttempt {
  upstream: UpstreamRequest;
  reply: ReplyReader;
}

/**
 * The statuses that say the host is busy or down, so the next host pin may
 * serve the call: too many requests, a server error, a bad or missing
 * gateway, a gateway timeout, and Anthropic's "overloaded". A refused key
 * (401), an empty account (402) or a refusal (403) never moves on
 * (HAL-3178): another host pin can't fix them.
 */
const movesOnStatuses: ReadonlySet<number> = new Set([429, 500, 502, 503, 504, 529]);

/**
 * The host pin each run's calls to each provider are on. A call that moved
 * on leaves the run on the new pin, so the program's own retry doesn't go
 * back to the host that just failed. Keyed by the run the bridge serves, so
 * it ends with the bridge.
 */
const currentPins = new WeakMap<HarnessBridgeOptions, Map<BridgeProvider, number>>();

/**
 * The host pins a call on `access` may use, in order (requirement
 * `harness-bridge.host-fallback`). The first is the access's own alias and
 * routing. The fallbacks follow only at OpenRouter, each with only
 * OpenRouter's routing keys, without any whose pin keeps the data less safe
 * than the first one, and at most {@link maxBridgeFallbacks} of them. So a
 * host that built a wrong list still can't loosen the data rules.
 */
export function hostPinsFor(access: BridgeProviderAccess): HostPin[] {
  if (access.kind !== "key") return [{}];
  const routing = routingFor(access);
  const first: HostPin = {
    ...(access.alias === undefined ? {} : { alias: access.alias }),
    ...(routing === undefined ? {} : { routing }),
  };
  if (access.fallbacks === undefined || !isAtOpenRouter(access)) return [first];
  const fallbacks = access.fallbacks
    .map((hop) => ({ alias: hop.alias, routing: bridgeRouting(hop.routing) }))
    .filter((hop) => keepsDataTerms(routing ?? {}, hop.routing))
    .slice(0, maxBridgeFallbacks);
  return [first, ...fallbacks];
}

/**
 * Sends one model call and hands its reply on for the program, moving on to
 * the next host pin of the same model when the host is busy or down
 * (requirement `harness-bridge.host-fallback`). It moves on only before any
 * byte of the reply has reached the program: when the reply's status is in
 * {@link movesOnStatuses}, or when the host can't be reached or sends no
 * status and headers within the bridge's response time limit. A slow reply
 * that has started is never cut off for another host.
 *
 * Each try is recorded as its own `llm.request`, with its alias and
 * routing, so a budget that is reached stops the next try before it goes
 * out. Between two tries the bridge records `llm.fallback`, in our own
 * words: the provider's error body is dropped unread. The last pin's reply
 * reaches the program as it came, whatever its status.
 *
 * @param attempt - builds the request for one routing from the body the bridge already read, so every try sends the same request but its `provider`
 * @throws what {@link recordModelCall} and the pass-through throw for the last try
 */
export async function sendModelCall(
  context: BridgeRequestContext,
  call: ModelCall,
  caller: UpstreamCaller,
  attempt: (routing: ProviderRouting | undefined) => PinnedAttempt,
): Promise<Response> {
  const { run } = context;
  const access = run.providers[call.provider];
  const pins = access === undefined ? [{}] : hostPinsFor(access);
  const last = pins.length - 1;
  let index = Math.min(currentPin(run, call.provider), last);
  for (;;) {
    const pinned = withPin(call, pins[index] ?? {});
    const { upstream, reply } = attempt(pinned.routing);
    try {
      return await recordModelCall(context, pinned, reply, () =>
        sendOnce(context, upstream, caller, index < last),
      );
    } catch (error) {
      if (!(error instanceof MovedOn)) throw error;
      index = Math.min(movedOn(run, call.provider, index), last);
      await recordFallback(run, pinned, withPin(call, pins[index] ?? {}), error.message);
    }
  }
}

/**
 * Says that a try is given up for the next host pin, in our own words. It
 * never leaves {@link sendModelCall}: the next try replaces it.
 */
class MovedOn extends Error {}

/**
 * Sends the call once and hands its reply on, or, when `canMoveOn` and the
 * host is busy or down, drops the reply and throws {@link MovedOn}.
 * Nothing of a dropped reply reaches its reader, so it records no
 * `llm.response`.
 */
async function sendOnce(
  context: BridgeRequestContext,
  upstream: UpstreamRequest,
  caller: UpstreamCaller,
  canMoveOn: boolean,
): Promise<PassedReply> {
  let started: StartedReply;
  try {
    started = await startCall(context, upstream, caller);
  } catch (error) {
    if (canMoveOn && hostDidNotAnswer(error, context)) {
      throw new MovedOn(`unavailable: ${error.message}`);
    }
    throw error;
  }
  if (canMoveOn && movesOnStatuses.has(started.status)) {
    await started.discard();
    throw new MovedOn(`unavailable: ${upstream.provider} answered ${started.status}.`);
  }
  return started.pass();
}

/**
 * True when the host couldn't be reached or didn't start its reply in time.
 * A call the program or the bridge stopped isn't one: it moves on nowhere.
 */
function hostDidNotAnswer(error: unknown, context: BridgeRequestContext): error is KindedError {
  return !context.signal.aborted && error instanceof KindedError && error.kind === "unavailable";
}

/** The call on `pin`: its alias and routing in place of the call's own. */
function withPin(call: ModelCall, pin: HostPin): ModelCall {
  const { alias: _alias, routing: _routing, ...rest } = call;
  return {
    ...rest,
    ...(pin.alias === undefined ? {} : { alias: pin.alias }),
    ...(pin.routing === undefined ? {} : { routing: pin.routing }),
  };
}

/** The index of the host pin the run's calls to `provider` are on; 0 until one moved on. */
function currentPin(run: HarnessBridgeOptions, provider: BridgeProvider): number {
  return currentPins.get(run)?.get(provider) ?? 0;
}

/**
 * Moves the run's calls to `provider` past the pin at `failed`, and gives
 * the pin they are on now. Two calls that fail on the same pin at once move
 * the run on by one pin, not two.
 */
function movedOn(run: HarnessBridgeOptions, provider: BridgeProvider, failed: number): number {
  const pins = currentPins.get(run) ?? new Map<BridgeProvider, number>();
  currentPins.set(run, pins);
  const next = Math.max(pins.get(provider) ?? 0, failed + 1);
  pins.set(provider, next);
  return next;
}

/** Records that a call moved from one host pin to the next, as the built-in loop's `llm.fallback`. */
async function recordFallback(
  run: HarnessBridgeOptions,
  from: ModelCall,
  to: ModelCall,
  error: string,
): Promise<void> {
  await run.recorder.record({
    type: "llm.fallback",
    agent: run.agentId,
    from: from.alias ?? from.model,
    to: to.alias ?? to.model,
    provider: providerNamed(run, to),
    model: to.model,
    ...(to.alias === undefined ? {} : { alias: to.alias }),
    error,
  });
}
