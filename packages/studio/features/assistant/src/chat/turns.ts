import type { RunFailure } from "@halonicjs/app/run-failure";
import { pageSiteOf, toolTexts } from "@halonicjs/assistant";
import type { ChatMessage, ToolCall } from "@halonicjs/ports";
import { chatFailureLine } from "@halonicjs/studio-feature-runs/api";
import type { ChatToolState } from "@halonicjs/studio-kit";
import { buildChatWords, toolInWords } from "./build-chat-words.ts";

/** One step of a reply as the transcript shows it: some text, one tool call, or a proposal card. */
export type ReplyStep =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "tool";
      readonly callId: string;
      readonly name: string;
      readonly state: ChatToolState;
      /** The item a `show` call showed, for its line "Showed run r42". */
      readonly shown?: { readonly kind: string; readonly id: string };
    }
  /** A `propose_file` or `propose_delete` that wrote changes to review (flow-assistant 3.1). */
  | {
      readonly kind: "proposal";
      readonly callId: string;
      readonly path: string;
      /** The model's one sentence on the change, as it gave it. */
      readonly why: string;
      /** The file's new text; `null` for a delete. */
      readonly content: string | null;
      /** The sites of the docs pages loaded in the chat before it was written (`assistant.build.loaded-page`). */
      readonly afterReading: readonly string[];
    };

/** How a reply ended, when it ended other than by answering. */
export type ReplyEnd =
  | { readonly kind: "stopped" }
  | { readonly kind: "stopped-when-closed" }
  /** The engine stopped mid-answer (states H13); Try again only when no tool ran. */
  | { readonly kind: "engine-stopped"; readonly toolsRan: boolean }
  | { readonly kind: "model-call-limit"; readonly calls: number }
  /** A failed answer; `failure` holds the facts when the model call failed for a reason a run names. */
  | {
      readonly kind: "failed";
      readonly reason: string;
      readonly toolsRan: boolean;
      readonly failure?: RunFailure | undefined;
    };

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
 * ended, by its place. A card names the sites of the docs pages read before it.
 */
export function turnsOf(
  messages: readonly ChatMessage[],
  ends: ReadonlyMap<number, ReplyEnd>,
  answering: boolean,
): readonly Turn[] {
  const turns: { message: string; steps: ReplyStep[] }[] = [];
  const calls = new Map<string, ToolCall>();
  const sitesRead = new Set<string>();
  for (const message of messages) {
    for (const call of message.role === "assistant" ? (message.toolCalls ?? []) : []) {
      calls.set(call.id, call);
    }
    if (message.role === "user") {
      turns.push({ message: message.content, steps: [] });
      continue;
    }
    const steps = turns.at(-1)?.steps;
    if (steps !== undefined) addStep(steps, message, calls, [...sitesRead]);
    addPageSite(sitesRead, message, calls);
  }
  return turns.map((turn, index) => {
    const live = answering && index === turns.length - 1;
    const steps = live
      ? turn.steps
      : turn.steps.filter((step) => step.kind !== "tool" || step.state !== "running");
    return { ...turn, steps, end: ends.get(index) };
  });
}

/**
 * Adds what a message of the reply shows: its text and tool calls, or a call's result. A write
 * that was made shows as its card; a refused one stays a tool line (flow-assistant 3.1).
 */
function addStep(
  steps: ReplyStep[],
  message: ChatMessage,
  calls: ReadonlyMap<string, ToolCall>,
  afterReading: readonly string[],
): void {
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
  if (step?.kind !== "tool") return;
  const call = calls.get(step.callId);
  const card = call === undefined ? undefined : proposalOf(call, message.content, afterReading);
  const shown = state === "done" && call?.name === "show" ? shownBy(call) : undefined;
  steps[index] = card ?? (shown === undefined ? { ...step, state } : { ...step, state, shown });
}

/** Adds the site of the docs page a `read_docs` result holds, when `message` is one. */
function addPageSite(
  sitesRead: Set<string>,
  message: ChatMessage,
  calls: ReadonlyMap<string, ToolCall>,
): void {
  if (message.role !== "tool") return;
  const call = calls.get(message.toolCallId);
  const site = call === undefined ? undefined : pageSiteOf(call, message.content);
  if (site !== undefined) sitesRead.add(site);
}

/** The item a `show` call names, when it names its kind and id. */
function shownBy(call: ToolCall): { kind: string; id: string } | undefined {
  const { kind, id } = call.arguments;
  return typeof kind === "string" && typeof id === "string" ? { kind, id } : undefined;
}

/**
 * The card of a write the tool made, told by its result; `undefined` for any other call.
 * `afterReading` is the sites of the docs pages loaded before it.
 */
function proposalOf(
  call: ToolCall,
  result: string,
  afterReading: readonly string[],
): ReplyStep | undefined {
  const { path, why, content } = call.arguments;
  if (typeof path !== "string") return undefined;
  const said = typeof why === "string" ? why : "";
  const written = { kind: "proposal", callId: call.id, path, why: said, afterReading } as const;
  if (call.name === "propose_file" && result === toolTexts.changed(path)) {
    return typeof content === "string" ? { ...written, content } : undefined;
  }
  if (call.name === "propose_delete" && result === toolTexts.deleted(path)) {
    return { ...written, content: null };
  }
  return undefined;
}

/** The status line while the chat answers: the tool it runs now, else "thinking" (H9). */
export function runningLine(tool: ToolCall | undefined): string {
  if (tool === undefined) return buildChatWords.thinking;
  const file = fileOf(tool);
  switch (tool.name) {
    case "list_files":
      return buildChatWords.listing;
    case "read_file":
      return file === undefined ? buildChatWords.using("read file") : buildChatWords.reading(file);
    case "schema":
      return buildChatWords.checkingSchema;
    case "propose_file":
      return buildChatWords.changing(file);
    case "propose_delete":
      return buildChatWords.deleting(file);
    case "validate":
      return buildChatWords.checkingWorkspace;
    case "show":
      return buildChatWords.showing;
    default:
      return buildChatWords.using(toolInWords(tool.name));
  }
}

/** The file a tool call names in its `path`, without its folders, or `undefined`. */
function fileOf(tool: ToolCall): string | undefined {
  const path = tool.arguments["path"];
  if (typeof path !== "string" || path === "") return undefined;
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The whole line a reply ended with, as the transcript shows it and the announcer reads it. */
export function endLine(end: ReplyEnd): string {
  switch (end.kind) {
    case "stopped":
      return buildChatWords.stoppedByYou;
    case "stopped-when-closed":
      return buildChatWords.stoppedWhenClosed;
    case "engine-stopped":
      return end.toolsRan
        ? `${buildChatWords.engineStopped} ${buildChatWords.toolsRan}`
        : buildChatWords.engineStopped;
    case "model-call-limit":
      return buildChatWords.modelCallLimit(end.calls);
    case "failed": {
      const cause = providerSentence(end) ?? buildChatWords.failed(end.reason);
      return end.toolsRan ? `${cause} ${buildChatWords.toolsRan}` : cause;
    }
  }
}

/**
 * The provider's own sentence for a failed answer, as the run page says it (microcopy 14.1 "Model
 * unreachable", 22 F7, F8), ending "then try again."; `undefined` without one, when the chat says
 * "Couldn't reach the model: *reason*." instead.
 */
export function providerSentence(end: ReplyEnd): string | undefined {
  if (end.kind !== "failed" || end.failure === undefined) return undefined;
  return chatFailureLine(end.failure);
}
