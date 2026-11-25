import { errorKindOf } from "@halonicjs/std";
import { EngineNotAnswering } from "@halonicjs/studio-shell";
import type { AssistantAnswer, Chat, ShownItem } from "../api.ts";
import { buildChatWords } from "./build-chat-words.ts";
import type { ChatView } from "./build-chats.ts";
import type { ReplyEnd } from "./turns.ts";

/** The view of a chat just read: a chat that was answering as Halonic closed says so (flow 5.4). */
export function viewOf(chat: Chat): ChatView {
  const ends = new Map<number, ReplyEnd>();
  const turns = chat.messages.filter((each) => each.role === "user").length;
  if (chat.stoppedWhenClosed && turns > 0) ends.set(turns - 1, { kind: "stopped-when-closed" });
  return {
    chat,
    messages: chat.messages,
    answering: false,
    tool: undefined,
    ends,
    stoppedByYou: false,
    shown: [],
  };
}

/** The chat's shown items with `shown` at the end, unless it is there already. */
export function withShown(view: ChatView, shown: ShownItem): Partial<ChatView> {
  return view.shown.some((each) => isSameItem(each, shown))
    ? {}
    : { shown: [...view.shown, shown] };
}

/** Whether two shown items are the same item: the same kind, hub and id. */
export function isSameItem(one: ShownItem, other: ShownItem): boolean {
  const [a, b] = [one.item, other.item];
  return a.kind === b.kind && a.hub === b.hub && a.id === b.id;
}

/** Why a chat couldn't load: the engine not answering yet in its own words (H11), else the error. */
export function loadFailure(error: unknown): string {
  if (error instanceof EngineNotAnswering || errorKindOf(error) === "unavailable") {
    return buildChatWords.engineNotStarted;
  }
  return error instanceof Error ? error.message : String(error);
}

/** How an answer the host rejected ended: the engine stopped (H13), or it failed (H22, H23). */
export function endOfError(error: unknown, toolsRan: boolean): ReplyEnd {
  if (error instanceof EngineNotAnswering) return { kind: "engine-stopped", toolsRan };
  const reason = error instanceof Error ? error.message : String(error);
  return { kind: "failed", reason, toolsRan };
}

/** How an answer the host gave ended; `undefined` when it answered. */
export function endOf({ end, failure }: AssistantAnswer): ReplyEnd | undefined {
  switch (end.reason) {
    case "answered":
      return undefined;
    case "stopped":
      return { kind: "stopped" };
    case "turn-limit":
      return { kind: "model-call-limit", calls: end.turns };
    case "failed":
      // The engine stopped mid-answer: the shell found it gone, or a turn couldn't reach it (K3).
      if (end.error instanceof EngineNotAnswering) {
        return { kind: "engine-stopped", toolsRan: end.toolsRan };
      }
      return { kind: "failed", reason: end.error.message, toolsRan: end.toolsRan, failure };
  }
}
