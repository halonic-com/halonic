import type { ChatMessage, ToolCall } from "@halonicjs/ports";
import type { ChatToolState } from "@halonicjs/studio-kit";
import { buildChatWords, toolInWords } from "./build-chat-words.ts";

/** One step of a reply as the transcript shows it: some text, or one tool call. */
export type ReplyStep =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "tool";
      readonly callId: string;
      readonly name: string;
      readonly state: ChatToolState;
    };

/** How a reply ended, when it ended other than by answering. */
export type ReplyEnd =
  | { readonly kind: "stopped" }
  | { readonly kind: "stopped-when-closed" }
  | { readonly kind: "model-call-limit"; readonly calls: number }
  | { readonly kind: "failed"; readonly reason: string; readonly toolsRan: boolean };

/** A message the person sent and the reply to it, as far as it got. */
export interface Turn {
  readonly message: string;
  readonly steps: readonly ReplyStep[];
  readonly end?: ReplyEnd | undefined;
}

/**
 * The chat's turns from its messages, oldest first. A tool call shows as running until its result
 * arrives, and as failed when the result is the chat service's "Error: …". A call that got no
 * result and isn't running any more did nothing, so it isn't shown. `ends` holds how each turn
 * ended, by its place.
 */
export function turnsOf(
  messages: readonly ChatMessage[],
  ends: ReadonlyMap<number, ReplyEnd>,
  answering: boolean,
): readonly Turn[] {
  const turns: { message: string; steps: ReplyStep[] }[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      turns.push({ message: message.content, steps: [] });
      continue;
    }
    const steps = turns.at(-1)?.steps;
    if (steps !== undefined) addStep(steps, message);
  }
  return turns.map((turn, index) => {
    const live = answering && index === turns.length - 1;
    const steps = live
      ? turn.steps
      : turn.steps.filter((step) => step.kind === "text" || step.state !== "running");
    return { ...turn, steps, end: ends.get(index) };
  });
}

/** Adds what a message of the reply shows: its text and tool calls, or a call's result. */
function addStep(steps: ReplyStep[], message: ChatMessage): void {
  if (message.role === "assistant") {
    if (message.content.trim() !== "") steps.push({ kind: "text", text: message.content });
    for (const call of message.toolCalls ?? []) {
      steps.push({ kind: "tool", callId: call.id, name: call.name, state: "running" });
    }
    return;
  }
  if (message.role !== "tool") return;
  const state: ChatToolState = message.content.startsWith("Error:") ? "failed" : "done";
  const index = steps.findIndex(
    (step) => step.kind === "tool" && step.callId === message.toolCallId,
  );
  const step = steps[index];
  if (step?.kind === "tool") steps[index] = { ...step, state };
}

/** The status line while the chat answers: the tool it runs now, else "thinking" (H9). */
export function runningLine(tool: ToolCall | undefined): string {
  if (tool === undefined) return buildChatWords.thinking;
  const path = tool.arguments["path"];
  if (tool.name === "read_file" && typeof path === "string" && path !== "") {
    return buildChatWords.reading(path.slice(path.lastIndexOf("/") + 1));
  }
  return buildChatWords.using(toolInWords(tool.name));
}

/** The whole line a reply ended with, as the transcript shows it and the announcer reads it. */
export function endLine(end: ReplyEnd): string {
  switch (end.kind) {
    case "stopped":
      return buildChatWords.stoppedByYou;
    case "stopped-when-closed":
      return buildChatWords.stoppedWhenClosed;
    case "model-call-limit":
      return buildChatWords.modelCallLimit(end.calls);
    case "failed": {
      const cause = buildChatWords.failed(end.reason);
      return end.toolsRan ? `${cause} ${buildChatWords.toolsRan}` : cause;
    }
  }
}
