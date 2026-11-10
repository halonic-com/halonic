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

/** How many characters one streamed text or input delta carries, so every answer comes in pieces. */
const deltaLength = 5;

/**
 * `answer` as the server-sent events of a streamed `/v1/messages` reply, in
 * the order the API sends them: a `ping`, each block opened empty, filled by
 * deltas and closed, and `message_delta` with the stop reason and the output
 * tokens so far.
 */
export function wireStream(answer: Answer): string {
  const message = wireMessage(answer);
  const blocks = contentBlocks(answer);
  const events = [
    messageStartEvent(answer.usage.inputTokens),
    { type: "ping" },
    ...blocks.flatMap((block, index) => blockEvents(block, index)),
    {
      type: "message_delta",
      delta: { stop_reason: message["stop_reason"], stop_sequence: null },
      usage: { output_tokens: answer.usage.outputTokens },
    },
    { type: "message_stop" },
  ];
  return serverSentEvents(events);
}

/** The start of a streamed reply that has written `text` so far and goes on. */
export function wirePartialStream(text: string): string {
  return serverSentEvents([
    messageStartEvent(1),
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ...pieces(text).map((piece) => blockDelta(0, { type: "text_delta", text: piece })),
  ]);
}

/** `events` written as server-sent events, each named after its type. */
export function serverSentEvents(events: Array<Record<string, unknown>>): string {
  return events.map((data) => `event: ${data["type"]}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

function messageStartEvent(inputTokens: number): Record<string, unknown> {
  return {
    type: "message_start",
    message: {
      ...messageHead(),
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 1 },
    },
  };
}

function blockEvents(
  block: Record<string, unknown>,
  index: number,
): Array<Record<string, unknown>> {
  const start = (content_block: Record<string, unknown>) => ({
    type: "content_block_start",
    index,
    content_block,
  });
  const stop = { type: "content_block_stop", index };
  switch (block["type"]) {
    case "thinking":
      return [
        start({ type: "thinking", thinking: "" }),
        ...pieces(String(block["thinking"])).map((piece) =>
          blockDelta(index, { type: "thinking_delta", thinking: piece }),
        ),
        blockDelta(index, { type: "signature_delta", signature: block["signature"] }),
        stop,
      ];
    case "text":
      return [
        start({ type: "text", text: "" }),
        ...pieces(String(block["text"])).map((piece) =>
          blockDelta(index, { type: "text_delta", text: piece }),
        ),
        stop,
      ];
    default:
      return [
        start({ ...block, input: {} }),
        ...pieces(JSON.stringify(block["input"])).map((piece) =>
          blockDelta(index, { type: "input_json_delta", partial_json: piece }),
        ),
        stop,
      ];
  }
}

function blockDelta(index: number, delta: Record<string, unknown>): Record<string, unknown> {
  return { type: "content_block_delta", index, delta };
}

/** `text` cut into pieces of {@link deltaLength} characters, never inside one. */
function pieces(text: string): string[] {
  const characters = Array.from(text);
  const cut: string[] = [];
  for (let start = 0; start < characters.length; start += deltaLength) {
    cut.push(characters.slice(start, start + deltaLength).join(""));
  }
  return cut;
}
