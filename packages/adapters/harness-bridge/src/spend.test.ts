import { type BridgeEvent, harnessBridgeTokenHeader, type ModelPrice } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import { controlledStream, fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import type { Fetch } from "./pass-through.ts";

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

/**
 * The price the test's `models.yaml` gives: only `claude-sonnet-5-5` has
 * one. Its cache prices are 0.05×, 1.25× and 2× the input price.
 */
const sonnetPrice: ModelPrice = {
  input: 3,
  output: 15,
  cacheRead: 0.15,
  cacheWrite: 3.75,
  cacheWrite1h: 6,
};

/**
 * Opens a bridge with the Anthropic route for an agent with a key, and keeps
 * what it records, each event once `landing` resolves, as a slow log would.
 */
async function open(fetch: Fetch, landing: () => Promise<void> = async () => {}) {
  const recorded: BridgeEvent[] = [];
  const route = anthropicRoute({
    secrets: { get: async () => "anthropic-test-value" },
    fetch,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  });
  const run = {
    ...fakeRun(),
    providers: { anthropic: { kind: "key" as const, secret: "anthropic-key" } },
    price: (_provider: string, model: string) =>
      model === "claude-sonnet-5-5" ? sonnetPrice : null,
    recorder: {
      record: async (event: BridgeEvent) => {
        await landing();
        recorded.push(event);
      },
    },
  };
  const bridge = await openBridge(run, {
    place: { kind: "loopback" },
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    routes: [route],
    closeTimeoutMs: 1_000,
  });
  closers.push(bridge.close);
  return { bridge, recorded };
}

/** Claude Code's request for `model`, with two messages. */
function programRequest(
  bridge: { url: string; token: string },
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
) {
  return fetch(`${bridge.url}/v1/messages`, {
    method: "POST",
    headers: { [harnessBridgeTokenHeader]: bridge.token, "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
      ...body,
    }),
    ...(signal === undefined ? {} : { signal }),
  });
}

/** One server-sent event as Anthropic writes it. */
function event(type: string, data: unknown) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`;
}

const request: BridgeEvent = {
  type: "llm.request",
  agent: "writer",
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  messages: 2,
};

verifies("harness-bridge.spend", () => {
  it("answers 429 with the recorder's reason and sends nothing when the recorder refuses the request", async () => {
    const anthropic = fakeProvider(() => new Response("{}"));
    const reason = "Run budget reached: 1.80 of 1.50 EUR spent.";
    const { bridge, recorded } = await open(anthropic.fetch, async () => {
      throw new KindedError("limit_reached", reason);
    });

    const reply = await programRequest(bridge);

    expect(reply.status).toBe(429);
    expect(await reply.json()).toEqual({
      type: "error",
      error: { type: "limit_reached", message: reason },
    });
    expect(anthropic.calls).toEqual([]);
    expect(recorded).toEqual([]);
  });

  describe("a streamed reply", () => {
    it("records the call with the usage from message_start and message_delta, its text and cost", async () => {
      const anthropic = fakeProvider(
        () =>
          new Response(
            [
              event("message_start", {
                message: {
                  usage: {
                    input_tokens: 100,
                    cache_creation_input_tokens: 5,
                    cache_read_input_tokens: 20,
                    output_tokens: 1,
                  },
                },
              }),
              event("content_block_delta", {
                index: 0,
                delta: { type: "text_delta", text: "Hel" },
              }),
              "event: ping\ndata: {}\n\n",
              event("content_block_delta", { index: 0, delta: { type: "text_delta", text: "lo" } }),
              event("message_delta", {
                delta: { stop_reason: "end_turn" },
                usage: { output_tokens: 42 },
              }),
              event("message_stop", {}),
            ].join(""),
            { headers: { "content-type": "text/event-stream" } },
          ),
      );
      const { bridge, recorded } = await open(anthropic.fetch);
      await (await programRequest(bridge, { stream: true })).text();

      await vi.waitFor(() => expect(recorded).toHaveLength(2));
      expect(recorded[0]).toEqual(request);
      expect(recorded[1]).toEqual({
        type: "llm.response",
        agent: "writer",
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        // The prompt cache's tokens are counted apart from input, as the Anthropic model adapter counts them.
        usage: { inputTokens: 100, outputTokens: 42, cacheReadTokens: 20, cacheWriteTokens: 5 },
        latencyMs: expect.any(Number),
        text: "Hello",
        cost: (100 * 3 + 42 * 15 + 20 * 0.15 + 5 * 3.75) / 1_000_000,
      });
    });

    it("records what a stream cut short used so far, because Anthropic charges for it", async () => {
      const stream = controlledStream();
      const anthropic = fakeProvider(
        () => new Response(stream.body, { headers: { "content-type": "text/event-stream" } }),
      );
      const { bridge, recorded } = await open(anthropic.fetch);
      const program = new AbortController();
      const reply = await programRequest(bridge, { stream: true }, program.signal);
      const reader = reply.body?.getReader();
      stream.push(
        event("message_start", { message: { usage: { input_tokens: 80, output_tokens: 1 } } }),
      );
      await reader?.read();

      program.abort();
      await vi.waitFor(() => expect(recorded).toHaveLength(2));
      expect(recorded[1]).toMatchObject({ usage: { inputTokens: 80, outputTokens: 1 }, text: "" });
    });

    it("records what a stream used before close() resolves when the bridge closes mid-stream", async () => {
      const stream = controlledStream();
      const anthropic = fakeProvider(
        () => new Response(stream.body, { headers: { "content-type": "text/event-stream" } }),
      );
      // Each event takes a turn of the event loop to land, so close() has to wait for it.
      const { bridge, recorded } = await open(
        anthropic.fetch,
        () => new Promise((resolve) => setImmediate(resolve)),
      );
      const reply = await programRequest(bridge, { stream: true });
      const reader = reply.body?.getReader();
      stream.push(
        event("message_start", { message: { usage: { input_tokens: 80, output_tokens: 1 } } }),
      );
      await reader?.read();

      await bridge.close();
      expect(recorded).toHaveLength(2);
      expect(recorded[1]).toMatchObject({ usage: { inputTokens: 80, outputTokens: 1 }, text: "" });
    });
  });

  it("records the usage and text of a reply that isn't streamed", async () => {
    const message = {
      type: "message",
      content: [
        { type: "thinking", thinking: "Short answer." },
        { type: "text", text: "Hi " },
        { type: "text", text: "there" },
      ],
      usage: { input_tokens: 10, output_tokens: 3 },
    };
    const anthropic = fakeProvider(() => Response.json(message));
    const { bridge, recorded } = await open(anthropic.fetch);
    await (await programRequest(bridge)).text();

    await vi.waitFor(() => expect(recorded).toHaveLength(2));
    expect(recorded[1]).toMatchObject({
      usage: { inputTokens: 10, outputTokens: 3 },
      text: "Hi there",
      cost: (10 * 3 + 3 * 15) / 1_000_000,
    });
  });

  describe("the prompt cache", () => {
    /** Records one reply that isn't streamed with `usage`, and returns its `llm.response`. */
    async function recordUsage(usage: Record<string, unknown>) {
      const message = { type: "message", content: [{ type: "text", text: "Hi" }], usage };
      const anthropic = fakeProvider(() => Response.json(message));
      const { bridge, recorded } = await open(anthropic.fetch);
      await (await programRequest(bridge)).text();
      await vi.waitFor(() => expect(recorded).toHaveLength(2));
      return recorded[1];
    }

    it("splits the cache writes into 5-minute and 1-hour writes, each at its own price", async () => {
      const response = await recordUsage({
        input_tokens: 10,
        output_tokens: 3,
        cache_creation_input_tokens: 300,
        cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
      });

      expect(response).toMatchObject({
        usage: { inputTokens: 10, outputTokens: 3, cacheWriteTokens: 100, cacheWrite1hTokens: 200 },
        cost: (10 * 3 + 3 * 15 + 100 * 3.75 + 200 * 6) / 1_000_000,
      });
    });

    it("counts every cache write as a 5-minute write when the reply doesn't split them", async () => {
      const response = await recordUsage({
        input_tokens: 10,
        output_tokens: 3,
        cache_creation_input_tokens: 300,
      });

      expect(response).toMatchObject({
        usage: { inputTokens: 10, outputTokens: 3, cacheWriteTokens: 300 },
      });
    });

    it("leaves out the cache counts that are 0", async () => {
      const response = await recordUsage({
        input_tokens: 10,
        output_tokens: 3,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      });

      expect(response).toMatchObject({ usage: { inputTokens: 10, outputTokens: 3 } });
      expect(Object.keys((response as { usage: object }).usage)).toEqual([
        "inputTokens",
        "outputTokens",
      ]);
    });

    it("costs a cache-heavy call less than the same tokens counted as plain input", async () => {
      const response = await recordUsage({
        input_tokens: 50,
        output_tokens: 200,
        cache_read_input_tokens: 90_000,
        cache_creation_input_tokens: 2_000,
      });

      const asPlainInput = ((50 + 90_000 + 2_000) * 3 + 200 * 15) / 1_000_000;
      expect((response as { cost: number }).cost).toBeLessThan(asPlainInput / 5);
    });
  });

  it("records a call to a model without a price without a cost, so the run shows it as unpriced", async () => {
    const anthropic = fakeProvider(() =>
      Response.json({ content: [], usage: { input_tokens: 10, output_tokens: 3 } }),
    );
    const { bridge, recorded } = await open(anthropic.fetch);
    await (await programRequest(bridge, { model: "claude-unpriced-1" })).text();

    await vi.waitFor(() => expect(recorded).toHaveLength(2));
    expect(recorded[1]).toMatchObject({ model: "claude-unpriced-1", usage: { inputTokens: 10 } });
    expect(recorded[1]).not.toHaveProperty("cost");
  });

  it("records only the request of a call Anthropic refused, which uses no tokens", async () => {
    const anthropic = fakeProvider(() =>
      Response.json(
        { type: "error", error: { type: "overloaded_error" }, usage: { input_tokens: 10 } },
        { status: 529 },
      ),
    );
    const { bridge, recorded } = await open(anthropic.fetch);
    expect((await programRequest(bridge)).status).toBe(529);

    await bridge.close();
    expect(recorded).toEqual([request]);
  });

  it("refuses a request that names no model, without calling Anthropic or recording it", async () => {
    const anthropic = fakeProvider(() => Response.json({}));
    const { bridge, recorded } = await open(anthropic.fetch);
    const reply = await programRequest(bridge, { model: undefined });

    expect(reply.status).toBe(400);
    expect(await reply.json()).toMatchObject({ error: { type: "invalid_input" } });
    expect(anthropic.calls).toHaveLength(0);
    expect(recorded).toEqual([]);
  });
});
