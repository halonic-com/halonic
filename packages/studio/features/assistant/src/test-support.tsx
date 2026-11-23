import type { ChatAnswer } from "@halonicjs/app";
import type { ChatMessage } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AssistantAnswerRequest, AssistantHost, Chat } from "./api.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

/** Unmounts what {@link show} drew; call it in `afterEach`. */
export function unmount(): void {
  act(() => root?.unmount());
  element?.remove();
}

/** Draws `node` in the document and waits for what it reads. */
export async function show(node: React.ReactNode): Promise<HTMLElement> {
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root?.render(node));
  return element;
}

/** The button with this text or name, or `undefined`. */
export function buttonNamed(page: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === name || button.getAttribute("aria-label") === name,
  );
}

/** Types into the box and presses Send. */
export async function sendMessage(page: HTMLElement, text: string): Promise<void> {
  const area = page.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, text);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => buttonNamed(page, "Send")?.click());
}

/** A chat as the host keeps it, a draft unless it has messages. */
export function chatOf(
  id: string,
  messages: readonly ChatMessage[] = [],
  title = "New chat",
): Chat {
  return {
    id,
    kind: "build",
    title,
    lastUsedAt: "2026-11-23T09:00:00.000Z",
    answering: false,
    itemsToReview: 0,
    model: { kind: "assistant" },
    messages,
    draft: messages.length === 0,
    stoppedWhenClosed: false,
  };
}

/**
 * An Assistant host that keeps chats in memory and whose answers the test gives one by one. A
 * chat's messages grow as the answer adds them, as the app's host keeps them.
 */
export function fakeHost(chats: Chat[] = []) {
  const requests: AssistantAnswerRequest[] = [];
  const pending: ((answer: ChatAnswer | Error) => void)[] = [];
  let reads = 0;
  let readFails: Error | undefined;
  let items = 0;
  const find = (chatId: string) => {
    const chat = chats.find((each) => each.id === chatId);
    if (chat === undefined) throw new KindedError("not_found", `No chat ${chatId}`);
    return chat;
  };
  const keep = (chat: Chat) => {
    chats = [chat, ...chats.filter((each) => each.id !== chat.id)];
  };
  const host: AssistantHost = {
    chats: async () => chats.filter((chat) => !chat.draft),
    chat: async (chatId) => {
      reads += 1;
      if (readFails !== undefined) throw readFails;
      return find(chatId);
    },
    newChat: async () => {
      const chat = chats.find((each) => each.draft) ?? chatOf(`chat-${chats.length + 1}`);
      keep(chat);
      return chat;
    },
    answer: (request) => {
      requests.push(request);
      const chat = find(request.chatId);
      const asked: ChatMessage[] =
        request.message === undefined ? [] : [{ role: "user", content: request.message }];
      keep({
        ...chat,
        messages: [...chat.messages, ...asked],
        draft: false,
        title: request.message ?? chat.title,
      });
      return new Promise((resolve, reject) => {
        pending.push((answer) => {
          if (answer instanceof Error) return reject(answer);
          const now = find(request.chatId);
          keep({ ...now, messages: [...now.messages, ...answer.messages] });
          resolve(answer);
        });
      });
    },
    rename: async () => {},
    deleteChat: async () => {},
    setModel: async () => {},
    models: async () => [],
    itemsToReview: async () => Array.from({ length: items }, () => ({}) as never),
    changesForCard: async () => [],
    changesIn: async () => null,
    accept: async () => ({}) as never,
    reject: async () => ({}) as never,
    undo: async () => ({}) as never,
    onDidChange: () => () => {},
  };
  return {
    host,
    requests,
    /** Ends the oldest answer still being written. */
    finish: async (answer: ChatAnswer | Error) => {
      await act(async () => pending.shift()?.(answer));
    },
    /** How often a chat was read. */
    reads: () => reads,
    /** Makes reading a chat fail, or work again with `undefined`. */
    failReads: (error: Error | undefined) => {
      readFails = error;
    },
    /** How many items the next answers leave to review. */
    leaveToReview: (count: number) => {
      items = count;
    },
  };
}
