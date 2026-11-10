import { chatRequest } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { toWireBody } from "./request.ts";

const plain = { maxTokensField: "max_tokens" } as const;

verifies("model-openai.request", () => {
  it("writes messages, tools and settings in the chat completions format", () => {
    const request = chatRequest();
    expect(toWireBody(request, plain)).toEqual({
      model: "acme-small",
      messages: [
        { role: "system", content: "You answer briefly." },
        { role: "user", content: "Find the Acme docs." },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_0",
              type: "function",
              function: { name: "search", arguments: '{"q":"docs"}' },
            },
          ],
        },
        { role: "tool", content: '["docs/über.md"]', tool_call_id: "call_0" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "search",
            description: "Searches the workspace.",
            parameters: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
          },
        },
      ],
      temperature: 0,
      max_tokens: 200,
      stream: false,
    });
    expect(request).toEqual(chatRequest());
  });

  it("asks for JSON, uses the given length field and lets extra add but not replace", () => {
    const body = toWireBody(
      {
        model: "acme-small",
        messages: [{ role: "user", content: "Hi" }],
        params: { maxTokens: 50, reasoningEffort: "low", extra: { seed: 7, model: "other" } },
        responseFormat: "json",
        meta: { agentId: "writer", runId: "run-1" },
      },
      { maxTokensField: "max_completion_tokens" },
    );
    expect(body).toEqual({
      seed: 7,
      model: "acme-small",
      messages: [{ role: "user", content: "Hi" }],
      max_completion_tokens: 50,
      reasoning_effort: "low",
      stream: false,
      response_format: { type: "json_object" },
    });
  });

  it("sends one length field, whatever extra says, and no empty stop list", () => {
    const body = toWireBody(
      {
        model: "acme-small",
        messages: [{ role: "user", content: "Hi" }],
        params: {
          maxTokens: 50,
          stop: [],
          extra: { max_tokens: 9, max_completion_tokens: 9, seed: 7 },
        },
      },
      { maxTokensField: "max_completion_tokens" },
    );
    expect(body).toEqual({
      seed: 7,
      model: "acme-small",
      messages: [{ role: "user", content: "Hi" }],
      max_completion_tokens: 50,
      stream: false,
    });
    const withStop = toWireBody(
      { model: "acme-small", messages: [], params: { stop: ["END"] } },
      plain,
    );
    expect(withStop["stop"]).toEqual(["END"]);
  });

  it("keeps the text of an assistant turn, with or without tool calls", () => {
    const call = { id: "call_0", name: "search", arguments: {} };
    const body = toWireBody(
      {
        model: "acme-small",
        messages: [
          { role: "assistant", content: "Hello." },
          { role: "assistant", content: "Let me look.", toolCalls: [call] },
        ],
      },
      plain,
    );
    expect(body["messages"]).toEqual([
      { role: "assistant", content: "Hello." },
      {
        role: "assistant",
        content: "Let me look.",
        tool_calls: [
          { id: "call_0", type: "function", function: { name: "search", arguments: "{}" } },
        ],
      },
    ]);
  });
});
