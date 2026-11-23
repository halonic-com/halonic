import type { ChatMessage, ChatTurnText, ToolCall } from "@halonicjs/ports";
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
  | {
      readonly kind: "failed";
      readonly reason: string;
      readonly toolsRan: boolean;
      /** The model's provider has no key, or turned the key away: Models is where that's fixed. */
      readonly needsKey?: true;
      /**
       * A failure Halonic can't explain: the text **Copy details** puts on the clipboard, in place
       * of **Try again** (microcopy 22 F13, C665-104).
       */
      readonly details?: string;
    }
  | { readonly kind: "engine-stopped"; readonly toolsRan: boolean };

/** A message the person sent and the agent's reply to it, as far as it got. */
export interface ChatTurn {
  readonly message: string;
  readonly steps: readonly ReplyStep[];
  /**
   * The text the model is writing now, shown after the steps: the turn's message replaces it once
   * it arrives, and a reply that ends first keeps it as a step.
   */
  readonly writing?: string;
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
 * A message the answer added: the model's text becomes a text step, in place of the text that was
 * being written; a tool's result marks its
 * call done, or failed when the result is the chat service's "Error: …". Every message joins the
 * conversation.
 */
export function withMessage(transcript: Transcript, message: ChatMessage): Transcript {
  const conversation = [...transcript.conversation, message];
  const shown = withLastTurn(transcript, (turn) => withMessageOf(turn, message));
  return { ...shown, conversation };
}

/**
 * The model writes its text: a `delta` adds to the text being written, a `restart` empties it. It
 * is for the transcript only and never joins the conversation.
 */
export function withText(transcript: Transcript, text: ChatTurnText): Transcript {
  return withLastTurn(transcript, ({ writing, ...turn }) =>
    text.kind === "delta" ? { ...turn, writing: (writing ?? "") + text.text } : turn,
  );
}

/**
 * The reply ended. Text still being written, as when the person stopped it or it failed part way,
 * stays as its last text step.
 */
export function endTurn(transcript: Transcript, end: ReplyEnd): Transcript {
  return withLastTurn(transcript, ({ writing, ...turn }) => ({
    ...turn,
    steps: writing === undefined ? turn.steps : textStepsWith(turn.steps, writing),
    end,
  }));
}

/** The steps a turn shows: its steps, then the text being written. */
export function shownSteps(turn: ChatTurn): readonly ReplyStep[] {
  return turn.writing === undefined ? turn.steps : textStepsWith(turn.steps, turn.writing);
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

function withLastTurn(transcript: Transcript, change: (turn: ChatTurn) => ChatTurn): Transcript {
  const last = transcript.turns.at(-1);
  if (last === undefined) return transcript;
  return { ...transcript, turns: [...transcript.turns.slice(0, -1), change(last)] };
}

function withLastSteps(
  transcript: Transcript,
  change: (steps: readonly ReplyStep[]) => readonly ReplyStep[],
): Transcript {
  return withLastTurn(transcript, (turn) => ({ ...turn, steps: change(turn.steps) }));
}

/** The turn's assistant message replaces the text that was being written. */
function withMessageOf(turn: ChatTurn, message: ChatMessage): ChatTurn {
  if (message.role !== "assistant") return { ...turn, steps: stepsWith(turn.steps, message) };
  const { writing: _replaced, ...rest } = turn;
  return { ...rest, steps: textStepsWith(turn.steps, message.content) };
}

function textStepsWith(steps: readonly ReplyStep[], text: string): readonly ReplyStep[] {
  return text.trim() === "" ? steps : [...steps, { kind: "text", text }];
}

function stepsWith(steps: readonly ReplyStep[], message: ChatMessage): readonly ReplyStep[] {
  if (message.role === "tool") {
    const state: ChatToolState = message.content.startsWith("Error:") ? "failed" : "done";
    return steps.map((step) =>
      step.kind === "tool" && step.callId === message.toolCallId ? { ...step, state } : step,
    );
  }
  return steps;
}
