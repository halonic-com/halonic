import type {
  BridgeProvider,
  BridgeProviderAccess,
  BridgeRecorder,
  HarnessBridge,
  ModelPrice,
  OpenHarnessBridge,
  Secrets,
} from "@halonicjs/ports";
import { type Infer, parse, s } from "@halonicjs/schema-kit";
import { isPlainObject } from "@halonicjs/std";
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
const unsendableMessage = "Studio's answer to this call couldn't be sent to the agent host.";
const unencodableMessage = "Studio's answer to this call couldn't be encoded as JSON.";
const unreadableFailureMessage = "Studio's service failed with an error it couldn't read.";
const malformedCallMessage = "The bridge's call wasn't of the expected shape.";

/**
 * How long the host has to send a bridge's first line, as long as it gives
 * Studio for a quick call. Then Studio hangs up, so `open` doesn't wait forever.
 */
export const bridgeOpenLimitMs = 30_000;

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

// Not strict: a field the host adds later mustn't make Studio drop every call.
const callLineSchema = s.discriminatedUnion("type", [
  s
    .object({
      type: s.literal("call"),
      call: s.string().min(1),
      method: s.string(),
      params: s.unknown(),
    })
    .passthrough(),
  s.object({ type: s.literal("cancel"), call: s.string().min(1) }).passthrough(),
]);

/** Enough of a call line to answer it with an error when the rest is malformed. */
const callIdSchema = s.object({ type: s.literal("call"), call: s.string().min(1) }).passthrough();

const openRoute = "POST /v1/bridge/open";

/** What Studio answers one call: the service's result, or why it has none. */
type CallOutcome = { result: unknown } | { error: string };

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
      const first = await firstLine(lines);
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
    const secrets = providerKeys(services.providers, services.secrets);
    const serving = this.#serve(opened.bridge, lines, { ...services, secrets, recorder });
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

  /**
   * Answers the bridge's calls until its stream ends. Calls run side by side:
   * an approval may wait long. When the stream ends, the calls still waiting
   * are aborted and this returns once the answers already on their way are
   * sent. It doesn't wait for a service that ignores the abort, since nobody
   * is left to take its answer, so closing the bridge never hangs on one.
   */
  async #serve(
    id: string,
    lines: AsyncIterator<unknown>,
    services: BridgeServices & { readonly recorder: BridgeRecorder },
  ): Promise<void> {
    const waiting = new Map<string, AbortController>();
    const sending = new Set<Promise<void>>();
    const send = (call: string, outcome: CallOutcome) => {
      const sent = this.#sendAnswer(id, call, outcome)
        // A backstop: #sendAnswer handles its own failures, and nothing
        // here may become an unhandled rejection in the page.
        .catch(() => {})
        .finally(() => sending.delete(sent));
      sending.add(sent);
    };
    try {
      for (let next = await lines.next(); !next.done; next = await lines.next()) {
        const parsed = parse(callLineSchema, next.value);
        if (!parsed.ok) {
          // The host waits for a call it sent, however malformed, so it gets an error.
          // Any other line isn't a call or a cancel: it is skipped, not taken for one.
          const call = parse(callIdSchema, next.value);
          if (call.ok) send(call.value.call, { error: malformedCallMessage });
          continue;
        }
        const line = parsed.value;
        if (line.type === "cancel") {
          waiting.get(line.call)?.abort();
          continue;
        }
        // The host numbers its calls, so only a broken host repeats a waiting one: skip it.
        if (waiting.has(line.call)) continue;
        const cancelled = new AbortController();
        waiting.set(line.call, cancelled);
        void answerCall(line, services, cancelled.signal).then((outcome) => {
          waiting.delete(line.call);
          // An aborted call: the bridge stopped waiting for it.
          if (!cancelled.signal.aborted) send(line.call, outcome);
        });
      }
    } catch {
      // The stream broke off: the host has closed the bridge, or gone.
    } finally {
      for (const call of waiting.values()) call.abort();
      await Promise.all(sending);
    }
  }

  /**
   * Sends one answer. One that can't be sent, because it doesn't turn into
   * JSON, is over the host's limit by its size here or by the host's 413, or
   * is refused for any other reason, is replaced by an error for that call,
   * so the call doesn't wait for an answer that never arrives (HAL-4730).
   */
  async #sendAnswer(bridge: string, call: string, outcome: CallOutcome): Promise<void> {
    const route = "POST /v1/bridge/answer";
    const errorAnswer = (error: string) => ({ bridge, call, error });
    const answerJson = asWellFormedJson({ bridge, call, ...outcome });
    let first: unknown;
    if (answerJson === undefined) first = errorAnswer(unencodableMessage);
    else if (!fitsAnswerLimit(answerJson.text)) first = errorAnswer(tooLargeMessage);
    else first = answerJson.data;
    const sentAsIs = first === answerJson?.data;
    try {
      const answer = await this.#transport.request(route, first);
      // 404: the call was cancelled, or the bridge closed, so nobody is left to tell.
      if (answer.status === 200 || answer.status === 404 || !sentAsIs) return;
      const error = answer.status === 413 ? tooLargeMessage : unsendableMessage;
      await this.#transport.request(route, errorAnswer(error));
    } catch {
      // The host has gone; its bridge with it.
    }
  }
}

/** Answers one call with its service. Never rejects: a failure becomes an error outcome. */
async function answerCall(
  line: { method: string; params: unknown },
  services: BridgeServices & { readonly recorder: BridgeRecorder },
  signal: AbortSignal,
): Promise<CallOutcome> {
  try {
    const result = await answerBridgeCall(line.method, line.params, services, signal);
    return { result: result ?? null };
  } catch (error) {
    return { error: failureMessage(error) };
  }
}

/**
 * What a service's failure says, for an error answer. Whatever was thrown,
 * this doesn't throw itself: a value with no prototype has no `toString`.
 */
function failureMessage(error: unknown): string {
  try {
    return error instanceof Error ? String(error.message) : String(error);
  } catch {
    return unreadableFailureMessage;
  }
}

/** The stream's first line, or a `bridge_failed` error when it doesn't come in time. */
async function firstLine(lines: AsyncIterator<unknown>): Promise<IteratorResult<unknown>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const message = `The agent host didn't open the bridge within ${bridgeOpenLimitMs / 1000} s.`;
      reject(new AgentHostError(200, "bridge_failed", message));
    }, bridgeOpenLimitMs);
  });
  try {
    return await Promise.race([lines.next(), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Studio's keys as a bridge may read them: only those its keyed providers
 * name. Any other name is `null` without asking `secrets`, the same rule as
 * the host's, so a host that asks for more still gets nothing.
 */
function providerKeys(
  providers: BridgeServices["providers"],
  secrets: Pick<Secrets, "get">,
): Pick<Secrets, "get"> {
  const named = new Set<string>();
  for (const access of Object.values(providers)) {
    if (access?.kind === "key") named.add(access.secret);
  }
  return { get: async (name) => (named.has(name) ? secrets.get(name) : null) };
}

/**
 * `value` as JSON whose text is well formed, with the plain data it reads
 * back as, or `undefined` when it has no JSON form (a BigInt, a cycle). A
 * lone surrogate, as from text cut in the middle of an emoji, becomes U+FFFD:
 * the shell's JSON parser refuses it.
 */
function asWellFormedJson(value: unknown): { text: string; data: unknown } | undefined {
  let text: string;
  try {
    text = JSON.stringify(value, wellFormedReplacer);
  } catch {
    return undefined;
  }
  return { text, data: JSON.parse(text) };
}

function wellFormedReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "string") return value.toWellFormed();
  if (isPlainObject(value) && Object.keys(value).some((key) => !key.isWellFormed())) {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key.toWellFormed(), v]));
  }
  return value;
}

/**
 * Whether `text` is at most {@link bridgeAnswerLimitBytes} in UTF-8. A UTF-16
 * code unit takes 1 to 3 bytes, so only text near the limit is encoded. The
 * host's own `TextEncoder`, not std's `encodeUtf8`: that one is written in
 * JavaScript, and a 1 MiB answer took it seconds on a loaded runner (HAL-5473).
 */
export function fitsAnswerLimit(text: string): boolean {
  if (text.length > bridgeAnswerLimitBytes) return false;
  if (text.length * 3 <= bridgeAnswerLimitBytes) return true;
  return new TextEncoder().encode(text).byteLength <= bridgeAnswerLimitBytes;
}
