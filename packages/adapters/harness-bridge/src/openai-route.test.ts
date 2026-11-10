import type { BridgeEvent, BridgeProviderAccess } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { controlledStream, fakeProvider } from "./fake-provider.test-helper.ts";
import { send } from "./fakes.test-helper.ts";
import {
  agentKey,
  closeOpenedBridges,
  codexRequest,
  event,
  open,
  programRequest,
  streamed,
} from "./openai-route.test-helper.ts";

afterEach(closeOpenedBridges);

verifies("harness-bridge.openai", () => {
  describe("passing a request on", () => {
    it("sends it to api.openai.com with the agent's key, the allowed headers and the same bytes", async () => {
      const openai = fakeProvider(
        () =>
          new Response('{"object":"response"}', {
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_1",
              "x-ratelimit-remaining-requests": "99",
              "openai-organization": "org-upstream",
            },
          }),
      );
      const { bridge } = await open(openai.fetch);
      const sent = `${JSON.stringify(codexRequest)}\n`;
      const reply = await programRequest(bridge, sent);

      expect(reply.status).toBe(200);
      expect(await reply.text()).toBe('{"object":"response"}');
      expect(reply.headers.get("x-request-id")).toBe("req_1");
      expect(reply.headers.get("x-ratelimit-remaining-requests")).toBe("99");
      expect(reply.headers.get("openai-organization")).toBeNull();
      const [call] = openai.calls;
      expect(call?.url).toBe("https://api.openai.com/v1/responses");
      expect(call?.body).toBe(sent);
      expect(Object.fromEntries(call?.headers ?? [])).toEqual({
        accept: "text/event-stream",
        authorization: `Bearer ${agentKey}`,
        "content-type": "application/json",
        "openai-beta": "responses=experimental",
      });
    });

    it("streams server-sent events back as they arrive", async () => {
      const stream = controlledStream();
      const openai = fakeProvider(() => new Response(stream.body, streamed));
      const { bridge } = await open(openai.fetch);
      const reply = await programRequest(bridge, codexRequest);
      const reader = reply.body?.pipeThrough(new TextDecoderStream()).getReader();

      const created = event("response.created", { response: { id: "resp_1" } });
      stream.push(created);
      expect((await reader?.read())?.value).toBe(created);
      const delta = event("response.output_text.delta", { delta: "Hi" });
      stream.push(delta);
      expect((await reader?.read())?.value).toBe(delta);
    });

    it("stops the call to OpenAI when Codex goes away", async () => {
      const stream = controlledStream();
      const openai = fakeProvider(() => new Response(stream.body, streamed));
      const { bridge } = await open(openai.fetch);
      const program = new AbortController();
      const reply = await programRequest(bridge, codexRequest, program.signal);
      stream.push(event("response.created", {}));
      await reply.body?.getReader().read();

      program.abort();
      await vi.waitFor(() => expect(openai.calls[0]?.signal.aborted).toBe(true));
    });

    it("gives back OpenAI's own error replies unchanged", async () => {
      const error = '{"error":{"type":"rate_limit_exceeded","message":"Slow down."}}';
      const openai = fakeProvider(
        () => new Response(error, { status: 429, headers: { "retry-after": "7" } }),
      );
      const reply = await programRequest((await open(openai.fetch)).bridge, codexRequest);
      expect(reply.status).toBe(429);
      expect(reply.headers.get("retry-after")).toBe("7");
      expect(await reply.text()).toBe(error);
    });
  });

  describe("refusing", () => {
    const cases: [string, BridgeProviderAccess | null, string, number][] = [
      ["an agent that doesn't use OpenAI", null, "denied", 403],
      ["a key that isn't set", { kind: "key", secret: "missing" }, "unauthenticated", 401],
    ];
    for (const [who, access, kind, status] of cases) {
      it(`refuses ${who} without calling OpenAI`, async () => {
        const openai = fakeProvider(() => new Response("{}"));
        const { bridge } = await open(openai.fetch, access);
        const reply = await programRequest(bridge, codexRequest);
        expect(reply.status).toBe(status);
        expect(await reply.json()).toMatchObject({ error: { type: kind } });
        expect(openai.calls).toHaveLength(0);
      });
    }

    it("refuses a key that holds a line break, and names only its secret", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const { bridge } = await open(openai.fetch, { kind: "key", secret: "broken-key" });
      const reply = await programRequest(bridge, codexRequest);
      expect(reply.status).toBe(401);
      const text = await reply.text();
      expect(JSON.parse(text).error.message).toContain(`The secret "broken-key"`);
      expect(text).not.toContain("openai-test");
      expect(openai.calls).toHaveLength(0);
    });

    it("refuses a body that isn't JSON", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const reply = await programRequest((await open(openai.fetch)).bridge, "{not json");
      expect(reply.status).toBe(400);
      expect(openai.calls).toHaveLength(0);
    });

    /** `codexRequest` with one more input item. */
    function withItem(item: object) {
      return { ...codexRequest, input: [...codexRequest.input, item] };
    }

    const urlInputs: [string, object, string][] = [
      [
        "an image",
        {
          role: "user",
          content: [
            { type: "input_text", text: "What is this?" },
            { type: "input_image", image_url: "https://example.test/a.png" },
          ],
        },
        "The input_image part at input[2].content[1]",
      ],
      [
        "a file",
        {
          type: "message",
          role: "user",
          content: [{ type: "input_file", file_url: "https://example.test/a.pdf" }],
        },
        "The input_file part at input[2].content[0]",
      ],
      [
        "an image in a tool call's output",
        {
          type: "function_call_output",
          call_id: "call_1",
          output: [{ type: "input_image", image_url: "HTTP://example.test/a.png" }],
        },
        "The input_image part at input[2].output[0]",
      ],
    ];
    for (const [what, item, named] of urlInputs) {
      it(`refuses ${what} that OpenAI would fetch from a URL, naming the part`, async () => {
        const openai = fakeProvider(() => new Response("{}"));
        const { bridge, recorded } = await open(openai.fetch);
        const reply = await programRequest(bridge, withItem(item));
        expect(reply.status).toBe(403);
        expect(await reply.json()).toMatchObject({
          error: { type: "denied", message: expect.stringContaining(named) },
        });
        expect(openai.calls).toHaveLength(0);
        expect(recorded).toEqual([]);
      });
    }

    it("refuses a stored prompt, which can bring tools the bridge can't see", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const { bridge, recorded } = await open(openai.fetch);
      const prompt = { id: "pmpt_placeholder", version: "2", variables: { city: "Utrecht" } };
      const reply = await programRequest(bridge, { ...codexRequest, prompt });
      expect(reply.status).toBe(403);
      expect(await reply.json()).toMatchObject({
        error: {
          type: "denied",
          message: expect.stringContaining("prompt stored in the OpenAI project"),
        },
      });
      expect(openai.calls).toHaveLength(0);
      expect(recorded).toEqual([]);
    });

    it("passes on a request whose prompt is null", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const { bridge } = await open(openai.fetch);
      const sent = JSON.stringify({ ...codexRequest, prompt: null });
      const reply = await programRequest(bridge, sent);
      expect(reply.status).toBe(200);
      expect(openai.calls[0]?.body).toBe(sent);
    });

    it("passes on an image or file sent as data, by id, or in a tool call's text output", async () => {
      const openai = fakeProvider(() => new Response("{}", { status: 200 }));
      const { bridge } = await open(openai.fetch);
      const request = {
        ...codexRequest,
        input: [
          {
            role: "user",
            content: [
              { type: "input_image", image_url: "data:image/png;base64,iVBORw0K", detail: "auto" },
              { type: "input_image", file_id: "file-placeholder" },
              {
                type: "input_file",
                filename: "a.pdf",
                file_data: "data:application/pdf;base64,JVBE",
              },
            ],
          },
          { type: "function_call_output", call_id: "call_1", output: "See https://example.test" },
        ],
        stream: false,
      };
      const sent = JSON.stringify(request);
      const reply = await programRequest(bridge, sent);
      expect(reply.status).toBe(200);
      expect(openai.calls).toHaveLength(1);
      expect(openai.calls[0]?.body).toBe(sent);
    });

    it("answers 404 for any other OpenAI path", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const { bridge } = await open(openai.fetch);
      const reply = await send(bridge, "/v1/chat/completions", { token: bridge.token, body: "{}" });
      expect(reply.status).toBe(404);
      expect(openai.calls).toHaveLength(0);
    });

    it("answers 503 when OpenAI can't be reached", async () => {
      const openai = fakeProvider(() => Promise.reject(new TypeError("fetch failed")));
      const reply = await programRequest((await open(openai.fetch)).bridge, codexRequest);
      expect(reply.status).toBe(503);
      expect(await reply.json()).toMatchObject({
        error: { type: "unavailable", message: "Halonic couldn't reach OpenAI." },
      });
    });
  });
});

const request: BridgeEvent = {
  type: "llm.request",
  agent: "writer",
  provider: "openai",
  model: "gpt-5.5",
  messages: 2,
};

verifies("harness-bridge.spend", () => {
  it("records an OpenAI stream with the usage from response.completed, its text and cost", async () => {
    const usage = { input_tokens: 100, input_tokens_details: { cached_tokens: 20 } };
    const openai = fakeProvider(
      () =>
        new Response(
          [
            event("response.created", { response: { usage: null } }),
            event("response.output_text.delta", { delta: "Hel" }),
            event("response.output_text.delta", { delta: "lo" }),
            event("response.completed", { response: { usage: { ...usage, output_tokens: 42 } } }),
          ].join(""),
          streamed,
        ),
    );
    const { bridge, recorded } = await open(openai.fetch);
    await (await programRequest(bridge, codexRequest)).text();

    await vi.waitFor(() => expect(recorded).toHaveLength(2));
    expect(recorded[0]).toEqual(request);
    expect(recorded[1]).toEqual({
      type: "llm.response",
      agent: "writer",
      provider: "openai",
      model: "gpt-5.5",
      // The 20 cached tokens are taken out of the input and priced as cache reads.
      usage: { inputTokens: 80, outputTokens: 42, cacheReadTokens: 20 },
      latencyMs: expect.any(Number),
      text: "Hello",
      cost: (80 * 1.25 + 42 * 10 + 20 * 0.125) / 1_000_000,
    });
  });

  it("counts a plain text input as one message", async () => {
    const openai = fakeProvider(() => Response.json({ usage: { input_tokens: 3 } }));
    const { bridge, recorded } = await open(openai.fetch);
    await (await programRequest(bridge, { model: "gpt-5.5", input: "Hi" })).text();

    await vi.waitFor(() => expect(recorded).toHaveLength(2));
    expect(recorded[0]).toMatchObject({ messages: 1 });
  });

  it("records only the request of a stream cut short, because OpenAI sends usage last", async () => {
    const stream = controlledStream();
    const openai = fakeProvider(() => new Response(stream.body, streamed));
    const { bridge, recorded } = await open(openai.fetch);
    const reply = await programRequest(bridge, codexRequest);
    stream.push(event("response.output_text.delta", { delta: "Hel" }));
    await reply.body?.getReader().read();

    await bridge.close();
    expect(recorded).toEqual([request]);
  });

  it("records only the request of a call OpenAI refused", async () => {
    const openai = fakeProvider(() =>
      Response.json(
        { error: { type: "server_error" }, usage: { input_tokens: 10 } },
        { status: 500 },
      ),
    );
    const { bridge, recorded } = await open(openai.fetch);
    expect((await programRequest(bridge, codexRequest)).status).toBe(500);

    await bridge.close();
    expect(recorded).toEqual([request]);
  });

  it("refuses a request that names no model, without calling OpenAI or recording it", async () => {
    const openai = fakeProvider(() => Response.json({}));
    const { bridge, recorded } = await open(openai.fetch);
    const reply = await programRequest(bridge, { ...codexRequest, model: undefined });

    expect(reply.status).toBe(400);
    expect(await reply.json()).toMatchObject({ error: { type: "invalid_input" } });
    expect(openai.calls).toHaveLength(0);
    expect(recorded).toEqual([]);
  });
});
