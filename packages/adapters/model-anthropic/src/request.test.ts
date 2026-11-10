import type { ChatRequest } from "@halonicjs/ports";
import { chatRequest } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defaultMaxTokens, toWireBody } from "./request.ts";

const plain = { stream: false } as const;

/** A thinking block as the API writes it; the signature is a made-up test value. */
const thinking = { type: "thinking", thinking: "Look it up.", signature: "test-signature" };

verifies("model-anthropic.request", () => {
  it("writes the system prompt, messages, tools and settings in the Messages format", () => {
    expect(toWireBody(chatRequest(), plain)).toEqual({
      model: "acme-small",
      max_tokens: 200,
      system: "You answer briefly.",
      messages: [
        { role: "user", content: [{ type: "text", text: "Find the Acme docs." }] },
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "call_0", name: "search", input: { q: "docs" } }],
        },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "call_0", content: '["docs/über.md"]' }],
        },
      ],
      tools: [
        {
          name: "search",
          description: "Searches the workspace.",
          input_schema: {
            type: "object",
            properties: { q: { type: "string" } },
            required: ["q"],
          },
        },
      ],
      temperature: 0,
      stream: false,
    });
  });

  it("merges turns of the same role, with tool results first", () => {
    const request: ChatRequest = {
      model: "acme-small",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Read both." },
        {
          role: "assistant",
          content: "Reading.",
          toolCalls: [
            { id: "call_1", name: "read", arguments: { path: "a" } },
            { id: "call_2", name: "read", arguments: { path: "b" } },
          ],
        },
        { role: "tool", content: "A", toolCallId: "call_1", name: "read" },
        { role: "system", content: "Answer in English." },
        { role: "user", content: "Also this." },
        { role: "tool", content: "B", toolCallId: "call_2", name: "read" },
      ],
    };
    const body = toWireBody(request, plain);
    expect(body["system"]).toBe("Be brief.\n\nAnswer in English.");
    expect(body["messages"]).toEqual([
      { role: "user", content: [{ type: "text", text: "Read both." }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Reading." },
          { type: "tool_use", id: "call_1", name: "read", input: { path: "a" } },
          { type: "tool_use", id: "call_2", name: "read", input: { path: "b" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: "A" },
          { type: "tool_result", tool_use_id: "call_2", content: "B" },
          { type: "text", text: "Also this." },
        ],
      },
    ]);
  });

  it("sends an Anthropic replay back unchanged, and builds the turn when the replay isn't ours", () => {
    const call = { type: "tool_use", id: "call_1", name: "search", input: { q: "acme" } };
    const turn = (replay: { type: string; data: unknown }): ChatRequest => ({
      model: "acme-small",
      messages: [
        { role: "user", content: "Find it." },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "search", arguments: { q: "acme" } }],
          replay,
        },
      ],
    });
    const ours = toWireBody(turn({ type: "anthropic", data: [thinking, call] }), plain);
    expect(ours["messages"]).toEqual([
      { role: "user", content: [{ type: "text", text: "Find it." }] },
      { role: "assistant", content: [thinking, call] },
    ]);
    for (const replay of [
      { type: "gemini", data: [thinking] },
      { type: "anthropic", data: "x" },
    ]) {
      const theirs = toWireBody(turn(replay), plain);
      expect(theirs["messages"]).toMatchObject([{}, { content: [call] }]);
    }
  });

  it("asks for an event stream, and sets a length limit when the request has none", () => {
    const body = toWireBody({ model: "acme-small", messages: [] }, { stream: true });
    expect(body).toEqual({
      model: "acme-small",
      max_tokens: defaultMaxTokens,
      messages: [],
      stream: true,
    });
  });

  it("writes top_p and stop sequences, and leaves out meta and the JSON format", () => {
    const body = toWireBody(
      {
        model: "acme-small",
        messages: [{ role: "user", content: "Hi" }],
        params: { topP: 0.9, stop: ["END"], reasoningEffort: "low" },
        responseFormat: "json",
        meta: { agentId: "agent-1", runId: "run-1" },
      },
      plain,
    );
    expect(body).toMatchObject({ top_p: 0.9, stop_sequences: ["END"] });
    expect(JSON.stringify(body)).not.toMatch(/agent-1|run-1|json|effort/);
  });

  it("adds extra settings without letting them replace ours", () => {
    const extra = {
      model: "other",
      stream: true,
      thinking: { type: "enabled", budget_tokens: 1024 },
    };
    const body = toWireBody({ model: "acme-small", messages: [], params: { extra } }, plain);
    expect(body).toMatchObject({ model: "acme-small", stream: false, thinking: extra.thinking });
  });

  it("leaves the request as it was", () => {
    const request = chatRequest();
    request.messages.push({
      role: "assistant",
      content: "",
      replay: { type: "anthropic", data: [thinking] },
    });
    const before = structuredClone(request);
    const body = toWireBody(request, plain);
    (body["messages"] as Array<{ content: Array<Record<string, unknown>> }>)
      .at(-1)
      ?.content.push({ type: "text", text: "changed" });
    expect(request).toEqual(before);
  });
});
