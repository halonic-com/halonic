import type { ChatMessage, ToolCall } from "@halonicjs/ports";
import type { ChatToolState } from "@halonicjs/studio-kit";

/** One step of a reply as the transcript shows it: some text, or one tool call. */
export type ReplyStep =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "tool";
      readonly callId: string;
      readonly name: string;
      readonly state: ChatToolState;
    };

/**
 * How a reply ended. `engine-stopped` is the engine going away while it answered (D4);
 * `failed` and `engine-stopped` say whether a tool already ran, since then sending the message
 * again could repeat what the tool did.
 */
export type ReplyEnd =
  | { readonly kind: "answered" }
  | { readonly kind: "stopped" }
  | { readonly kind: "turn-limit"; readonly turns: number }
  | { readonly kind: "failed"; readonly reason: string; readonly toolsRan: boolean }
  | { readonly kind: "engine-stopped"; readonly toolsRan: boolean };

/** A message the person sent and the agent's reply to it, as far as it got. */
export interface ChatTurn {
  readonly message: string;
  readonly steps: readonly ReplyStep[];
  /** Absent while the reply is being written. */
  readonly end?: ReplyEnd;
}

/**
 * A Try it chat in this session: what the transcript shows, turn by turn, and the conversation the
 * next answer is given. Each function returns a new transcript and leaves the one it got as it is.
 */
export interface Transcript {
  readonly turns: readonly ChatTurn[];
  /** The messages so far, the person's and the answers', as the model reads them. */
  readonly conversation: readonly ChatMessage[];
}

/** A chat with nothing in it yet: the empty draft (H2). */
export const emptyTranscript: Transcript = { turns: [], conversation: [] };

/** The person sent `message`: a new turn whose reply is being written. */
export function startTurn(transcript: Transcript, message: string): Transcript {
  return {
    turns: [...transcript.turns, { message, steps: [] }],
    conversation: [...transcript.conversation, { role: "user", content: message }],
  };
}

/** The reply calls a tool: a running tool line. */
export function withToolCall(transcript: Transcript, call: ToolCall): Transcript {
  return withLastSteps(transcript, (steps) => [
    ...steps,
    { kind: "tool", callId: call.id, name: call.name, state: "running" },
  ]);
}

/**
 * A message the answer added: the model's text becomes a text step; a tool's result marks its
 * call done, or failed when the result is the chat service's "Error: …". Every message joins the
 * conversation.
 */
export function withMessage(transcript: Transcript, message: ChatMessage): Transcript {
  const conversation = [...transcript.conversation, message];
  const shown = withLastSteps(transcript, (steps) => stepsWith(steps, message));
  return { ...shown, conversation };
}

/** The reply ended. */
export function endTurn(transcript: Transcript, end: ReplyEnd): Transcript {
  const last = transcript.turns.at(-1);
  if (last === undefined) return transcript;
  return { ...transcript, turns: [...transcript.turns.slice(0, -1), { ...last, end }] };
}

/**
 * Whether the reply being written called a tool, so it may have changed something: the same rule
 * as the chat service's `toolsRan`.
 */
export function toolsRanInLastTurn(transcript: Transcript): boolean {
  const last = transcript.turns.at(-1);
  return last?.steps.some((step) => step.kind === "tool") ?? false;
}

/**
 * Takes back the last turn, for **Try again**: the transcript and the conversation as they were
 * before it was sent, and the message, to send again.
 */
export function withoutLastTurn(transcript: Transcript): {
  readonly transcript: Transcript;
  readonly message: string | undefined;
} {
  const last = transcript.turns.at(-1);
  if (last === undefined) return { transcript, message: undefined };
  const sentAt = transcript.conversation.findLastIndex(
    (each) => each.role === "user" && each.content === last.message,
  );
  return {
    transcript: {
      turns: transcript.turns.slice(0, -1),
      conversation: sentAt < 0 ? transcript.conversation : transcript.conversation.slice(0, sentAt),
    },
    message: last.message,
  };
}

function withLastSteps(
  transcript: Transcript,
  change: (steps: readonly ReplyStep[]) => readonly ReplyStep[],
): Transcript {
  const last = transcript.turns.at(-1);
  if (last === undefined) return transcript;
  const turn = { ...last, steps: change(last.steps) };
  return { ...transcript, turns: [...transcript.turns.slice(0, -1), turn] };
}

function stepsWith(steps: readonly ReplyStep[], message: ChatMessage): readonly ReplyStep[] {
  if (message.role === "assistant") {
    return message.content.trim() === ""
      ? steps
      : [...steps, { kind: "text", text: message.content }];
  }
  if (message.role === "tool") {
    const state: ChatToolState = message.content.startsWith("Error:") ? "failed" : "done";
    return steps.map((step) =>
      step.kind === "tool" && step.callId === message.toolCallId ? { ...step, state } : step,
    );
  }
  return steps;
}
