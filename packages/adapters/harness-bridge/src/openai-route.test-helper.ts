import {
  type BridgeEvent,
  type BridgeProviderAccess,
  harnessBridgeTokenHeader,
} from "@halonicjs/ports";
import { openBridge } from "./bridge.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import { openAiRoute } from "./openai-route.ts";
import type { Fetch } from "./pass-through.ts";

/** The value the fake secrets hold for the agent's key. Not a real key. */
export const agentKey = "openai-test-value";

/** The fake secrets: the agent's key, and one that holds a line break. */
const secretValues = new Map([
  ["openai-key", agentKey],
  ["broken-key", "openai-test\nvalue"],
]);

const closers: (() => Promise<void>)[] = [];

/** Closes every bridge `open` opened. Call it after each test. */
export async function closeOpenedBridges() {
  await Promise.all(closers.splice(0).map((close) => close()));
}

const keyed: BridgeProviderAccess = { kind: "key", secret: "openai-key" };

/**
 * Opens a bridge that serves only the OpenAI route, for an agent with the
 * given access (`null`: none), and keeps what it records. Only `gpt-5.5` has
 * a price: 1.25 for input, 10 for output and 0.125 for cache reads, per
 * million tokens.
 */
export async function open(fetch: Fetch, openai: BridgeProviderAccess | null = keyed) {
  const recorded: BridgeEvent[] = [];
  const secrets = { get: async (name: string) => secretValues.get(name) ?? null };
  const route = openAiRoute({
    secrets,
    fetch,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  });
  const run = {
    ...fakeRun(),
    providers: openai === null ? {} : { openai },
    price: (_provider: string, model: string) =>
      model === "gpt-5.5" ? { input: 1.25, output: 10, cacheRead: 0.125 } : null,
    recorder: { record: async (event: BridgeEvent) => void recorded.push(event) },
  };
  const bridge = await openBridge(run, {
    place: { kind: "loopback" },
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [route],
  });
  closers.push(bridge.close);
  return { bridge, recorded };
}

/** Codex's request: its own key and organization, its headers, and the run token. */
export function programRequest(
  bridge: { url: string; token: string },
  body: unknown,
  signal?: AbortSignal,
) {
  return fetch(`${bridge.url}/v1/responses`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      authorization: "Bearer the-programs-own-placeholder",
      "openai-organization": "org-placeholder",
      "openai-beta": "responses=experimental",
      accept: "text/event-stream",
      "content-type": "application/json",
      originator: "codex_cli_rs",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
}

/** A Responses request as Codex sends it, with a shell tool and two input items. */
export const codexRequest = {
  model: "gpt-5.5",
  instructions: "You are Codex.",
  input: [
    { type: "message", role: "user", content: [{ type: "input_text", text: "Hi" }] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello" }] },
  ],
  tools: [{ type: "function", name: "shell", parameters: { type: "object" } }],
  stream: true,
  store: false,
};

/** One server-sent event as the Responses API writes it. */
export function event(type: string, data: object) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

/** The headers of a streamed reply. */
export const streamed = { headers: { "content-type": "text/event-stream" } };
