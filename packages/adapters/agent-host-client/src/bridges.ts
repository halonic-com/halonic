import type {
  BridgeProvider,
  BridgeProviderAccess,
  BridgeRecorder,
  HarnessBridge,
  ModelPrice,
  OpenHarnessBridge,
} from "@halonicjs/ports";
import { type Infer, parse, s } from "@halonicjs/schema-kit";
import { encodeUtf8 } from "@halonicjs/std";
import { answerBridgeCall, type BridgeCallServices } from "./bridge-calls.ts";
import { AgentHostError, type AgentHostTransport, answerError, checked } from "./transport.ts";

/**
 * The largest `/v1/bridge/answer` body the host takes (HAL-4730). A bigger
 * one gets 413 and the call goes on waiting, so Studio sends an error for
 * that call instead.
 */
export const bridgeAnswerLimitBytes = 1024 * 1024;

const tooLargeMessage =
  "Studio's answer to this call is larger than the agent host takes (1 MiB), so it wasn't sent.";

/** The agent a bridge serves; the engine's `HarnessAgent` has these and more. */
export interface BridgeAgent {
  readonly runId: string;
  readonly agentId: string;
}

/** What Studio serves one agent's bridge. */
export interface BridgeServices extends BridgeCallServices {
  readonly providers: Partial<Record<BridgeProvider, BridgeProviderAccess>>;
  /** Each provider's models with a price, because the bridge asks for a price without waiting. */
  readonly prices: Partial<Record<BridgeProvider, Readonly<Record<string, ModelPrice>>>>;
}

export interface AgentHostBridgesOptions {
  /** The providers, prices, tools, approvals and keys of the agent's bridge. */
  servicesFor(agent: BridgeAgent): BridgeServices | Promise<BridgeServices>;
}

const firstLineSchema = s.discriminatedUnion("type", [
  s
    .object({
      type: s.literal("opened"),
      bridge: s.string().min(1),
      url: s.string().min(1),
      token: s.string().min(1),
    })
    .strict(),
  s.object({ type: s.literal("failed"), message: s.string() }).strict(),
]);

const callLineSchema = s.discriminatedUnion("type", [
  s
    .object({
      type: s.literal("call"),
      call: s.string().min(1),
      method: s.string(),
      params: s.unknown(),
    })
    .strict(),
  s.object({ type: s.literal("cancel"), call: s.string().min(1) }).strict(),
]);

const openRoute = "POST /v1/bridge/open";

/**
 * The engine's bridge host (`HarnessBridgeHost` in the engine), as a
 * stand-in: each bridge opens in the agent host, next to the sandbox whose
 * program calls it, while its recorder, tools, approvals and keys stay
 * here. The host calls them over the bridge's stream, and this answers.
 */
export class AgentHostBridges {
  readonly #transport: AgentHostTransport;
  readonly #servicesFor: AgentHostBridgesOptions["servicesFor"];
  /** The host's id of each open bridge, by its token, for {@link idOf}. */
  readonly #ids = new Map<string, string>();

  constructor(transport: AgentHostTransport, options: AgentHostBridgesOptions) {
    this.#transport = transport;
    this.#servicesFor = options.servicesFor;
  }

  /**
   * Opens the agent's bridge in the host.
   *
   * @throws {@link AgentHostError} when the host refuses (`too_many_bridges`)
   *   or the bridge can't listen (`bridge_failed`)
   */
  async open(agent: BridgeAgent, recorder: BridgeRecorder): Promise<OpenHarnessBridge> {
    const services = await this.#servicesFor(agent);
    const hangUp = new AbortController();
    const body = {
      runId: agent.runId,
      agentId: agent.agentId,
      providers: services.providers,
      prices: services.prices,
    };
    const answer = await this.#transport.stream(openRoute, body, { signal: hangUp.signal });
    if (!answer.ok) throw answerError(openRoute, answer.answer);
    const lines = answer.lines[Symbol.asyncIterator]();
    let opened: Infer<typeof firstLineSchema> | undefined;
    try {
      const first = await lines.next();
      opened = first.done ? undefined : checked(openRoute, first.value, firstLineSchema);
    } catch (error) {
      // Hanging up closes the bridge in the host, which may have opened it.
      hangUp.abort();
      throw error;
    }
    if (opened?.type !== "opened") {
      hangUp.abort();
      const message =
        opened?.message ?? "The agent host ended the bridge's stream before it opened.";
      throw new AgentHostError(200, "bridge_failed", message);
    }
    this.#ids.set(opened.token, opened.bridge);
    const serving = this.#serve(opened.bridge, lines, { ...services, recorder });
    return {
      url: opened.url,
      token: opened.token,
      close: () => this.#close(opened.bridge, opened.token, serving, hangUp),
    };
  }

  /** The host's id of an open bridge, so a harness run names it; `undefined` for any other. */
  idOf(bridge: HarnessBridge): string | undefined {
    return this.#ids.get(bridge.token);
  }

  /** Closes the bridge in the host, which records its last events and then ends the stream. */
  async #close(
    id: string,
    token: string,
    serving: Promise<void>,
    hangUp: AbortController,
  ): Promise<void> {
    this.#ids.delete(token);
    const route = "POST /v1/bridge/close";
    try {
      const answer = await this.#transport.request(route, { bridge: id });
      // 404: the host has already closed it.
      if (answer.status !== 200 && answer.status !== 404) throw answerError(route, answer);
    } catch (error) {
      // Hanging up also closes the bridge in the host.
      hangUp.abort();
      throw error;
    }
    await serving;
  }

  /** Answers the bridge's calls until its stream ends. Calls run side by side: an approval may wait long. */
  async #serve(
    id: string,
    lines: AsyncIterator<unknown>,
    services: BridgeServices & { readonly recorder: BridgeRecorder },
  ): Promise<void> {
    const waiting = new Map<string, AbortController>();
    const answering = new Set<Promise<void>>();
    try {
      for (let next = await lines.next(); !next.done; next = await lines.next()) {
        const parsed = parse(callLineSchema, next.value);
        // A line that isn't a call or a cancel is skipped, not taken for one.
        if (!parsed.ok) continue;
        const line = parsed.value;
        if (line.type === "cancel") {
          waiting.get(line.call)?.abort();
          continue;
        }
        const cancelled = new AbortController();
        waiting.set(line.call, cancelled);
        const done = this.#answerCall(id, line, services, cancelled.signal).finally(() => {
          waiting.delete(line.call);
          answering.delete(done);
        });
        answering.add(done);
      }
    } catch {
      // The stream broke off: the host has closed the bridge, or gone.
    } finally {
      for (const call of waiting.values()) call.abort();
      await Promise.all(answering);
    }
  }

  async #answerCall(
    id: string,
    line: { call: string; method: string; params: unknown },
    services: BridgeServices & { readonly recorder: BridgeRecorder },
    signal: AbortSignal,
  ): Promise<void> {
    let outcome: { result: unknown } | { error: string };
    try {
      const result = await answerBridgeCall(line.method, line.params, services, signal);
      outcome = { result: result ?? null };
    } catch (error) {
      outcome = { error: error instanceof Error ? error.message : String(error) };
    }
    if (signal.aborted) return; // The bridge stopped waiting for it.
    await this.#sendAnswer({ bridge: id, call: line.call, ...outcome });
  }

  /**
   * Sends one answer. One over the host's limit, by its size here or by the
   * host's 413, is replaced by an error for that call, so the call doesn't
   * wait for an answer that never arrives (HAL-4730).
   */
  async #sendAnswer(
    body: { bridge: string; call: string } & Record<string, unknown>,
  ): Promise<void> {
    const route = "POST /v1/bridge/answer";
    const tooLarge = { bridge: body.bridge, call: body.call, error: tooLargeMessage };
    const fits = fitsAnswerLimit(JSON.stringify(body));
    try {
      const answer = await this.#transport.request(route, fits ? body : tooLarge);
      if (answer.status === 413 && fits) await this.#transport.request(route, tooLarge);
      // Any other refusal (404: the call was cancelled, or the bridge closed) has nobody left to tell.
    } catch {
      // The host has gone; its bridge with it.
    }
  }
}

/**
 * Whether `text` is at most {@link bridgeAnswerLimitBytes} in UTF-8. A UTF-16
 * code unit takes 1 to 3 bytes, so only text near the limit is encoded.
 */
export function fitsAnswerLimit(text: string): boolean {
  if (text.length > bridgeAnswerLimitBytes) return false;
  if (text.length * 3 <= bridgeAnswerLimitBytes) return true;
  return encodeUtf8(text).byteLength <= bridgeAnswerLimitBytes;
}
