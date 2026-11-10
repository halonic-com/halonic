import type { ChatResponse } from "@halonicjs/ports";

// Messages API replies in the shapes the API sends them, as recorded from its
// documentation. Signatures are made-up test values.

type Answer = Omit<ChatResponse, "replay">;

const stopReasons: Record<Answer["finishReason"], string> = {
  stop: "end_turn",
  length: "max_tokens",
  tool_calls: "tool_use",
  error: "refusal",
  other: "pause_turn",
};

/** `answer` as a `/v1/messages` reply body. */
export function wireMessage(answer: Answer): Record<string, unknown> {
  return {
    ...messageHead(),
    content: contentBlocks(answer),
    stop_reason: stopReasons[answer.finishReason],
    stop_sequence: null,
    usage: { input_tokens: answer.usage.inputTokens, output_tokens: answer.usage.outputTokens },
  };
}

function messageHead(): Record<string, unknown> {
  return { id: "msg_1", type: "message", role: "assistant", model: "acme-small" };
}

function contentBlocks(answer: Answer): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  if (answer.reasoning !== undefined) {
    blocks.push({ type: "thinking", thinking: answer.reasoning, signature: "test-signature" });
  }
  if (answer.content !== "") blocks.push({ type: "text", text: answer.content });
  for (const call of answer.toolCalls) {
    blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments });
  }
  return blocks;
}
