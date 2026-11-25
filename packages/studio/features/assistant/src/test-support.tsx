import type { ChatMessage, SavedChatDocs } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { WorkspaceUntrusted } from "@halonicjs/studio-shell";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  AssistantAnswer,
  AssistantAnswerRequest,
  AssistantChange,
  AssistantHost,
  Chat,
  ChatAgent,
  ModelOption,
} from "./api.ts";
import { sameAbout } from "./api.ts";

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

/** The Settings › Assistant model, ready to use: what a test's chat answers on unless it says. */
export const settingsModel: ModelOption = {
  model: { kind: "assistant" },
  label: "claude-sonnet-5-5",
  from: "settings",
  problem: null,
};

/**
 * An Assistant host that keeps chats in memory and whose answers the test gives one by one. A
 * chat's messages grow as the answer adds them, as the app's host keeps them.
 */
export function fakeHost(
  chats: Chat[] = [],
  choices: { models?: readonly ModelOption[]; agents?: readonly ChatAgent[] } = {},
) {
  const requests: AssistantAnswerRequest[] = [];
  const pending: ((answer: AssistantAnswer | Error) => void)[] = [];
  let reads = 0;
  let readFails: Error | undefined;
  let items = 0;
  let skill: string | null = null;
  let customized = 0;
  let engineAnswering = true;
  let trusted = true;
  let trustAnswer: "trusted" | "declined" = "declined";
  let trustChecks = 0;
  let authoringOnly = false;
  const docs = new Map<string, SavedChatDocs>();
  const listeners = new Set<(change: AssistantChange) => void>();
  const find = (chatId: string) => {
    const chat = chats.find((each) => each.id === chatId);
    if (chat === undefined) throw new KindedError("not_found", `No chat ${chatId}`);
    return chat;
  };
  const keep = (chat: Chat) => {
    chats = [chat, ...chats.filter((each) => each.id !== chat.id)];
    for (const listener of listeners) listener({ kind: "chats" });
  };
  const host: AssistantHost = {
    chats: async () => chats.filter((chat) => !chat.draft),
    chat: async (chatId) => {
      reads += 1;
      if (readFails !== undefined) throw readFails;
      return find(chatId);
    },
    newChat: async (kind, about) => {
      const chat = chats.find(
        (each) => each.draft && each.kind === kind && sameAbout(each.about, about),
      ) ?? { ...chatOf(`chat-${chats.length + 1}`), kind, ...(about ? { about } : {}) };
      keep(chat);
      return chat;
    },
    answer: (request) => {
      requests.push(request);
      if (!trusted) return Promise.reject(new WorkspaceUntrusted("Acme isn't trusted yet."));
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
    rename: async (chatId, title) => {
      const chat = find(chatId);
      chats = chats.map((each) => (each === chat ? { ...chat, title: title.trim() } : each));
    },
    deleteChat: async (chatId) => {
      chats = chats.filter((each) => each.id !== chatId);
    },
    chatDocs: async (chatId) => docs.get(chatId) ?? { sites: [], log: [] },
    answerSite: async (chatId, cardId, answer) => {
      const kept = docs.get(chatId) ?? { sites: [], log: [] };
      const sites = kept.sites.map((site) => (site.cardId === cardId ? { ...site, answer } : site));
      docs.set(chatId, { ...kept, sites });
      for (const listener of listeners) listener({ kind: "chat", chatId });
    },
    setModel: async (chatId, model) => keep({ ...find(chatId), model }),
    models: async () => choices.models ?? [settingsModel],
    agents: async () => choices.agents ?? [],
    itemsToReview: async () => Array.from({ length: items }, () => ({}) as never),
    changesForCard: async () => [],
    changesIn: async () => null,
    savedText: async () => null,
    accept: async () => ({}) as never,
    reject: async () => ({}) as never,
    undo: async () => ({}) as never,
    authoringSkill: async () => skill,
    customizeSkill: async () => {
      customized += 1;
      skill ??= "library/skills/halonic-authoring/SKILL.md";
      return skill;
    },
    onDidChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    engineAnswering: () => engineAnswering,
    authoringOnly: async () => authoringOnly,
    workspaceName: () => "Acme",
    askTrust: async () => {
      trustChecks += 1;
      trusted = trustAnswer === "trusted";
      return trustAnswer;
    },
  };
  return {
    host,
    requests,
    /** The engine stops or starts answering, as the app's host says it. */
    setEngineAnswering: async (answering: boolean) => {
      engineAnswering = answering;
      await act(async () => {
        for (const listener of listeners) listener({ kind: "engine" });
      });
    },
    /** The workspace isn't trusted, and the trust check answers `answer`. */
    untrusted: (answer: "trusted" | "declined") => {
      trusted = false;
      trustAnswer = answer;
    },
    /** Whether chats answer with the authoring tools only (H17), told as a change of trust. */
    setAuthoringOnly: async (value: boolean) => {
      authoringOnly = value;
      await act(async () => {
        for (const listener of listeners) listener({ kind: "trust" });
      });
    },
    /** How often the trust check opened. */
    trustChecks: () => trustChecks,
    /** Ends the oldest answer still being written. */
    finish: async (answer: AssistantAnswer | Error) => {
      await act(async () => pending.shift()?.(answer));
    },
    /** The chats as the host keeps them now, drafts too, most recently used first. */
    kept: () => chats,
    /** How often a chat was read. */
    reads: () => reads,
    /** Makes reading a chat fail, or work again with `undefined`. */
    failReads: (error: Error | undefined) => {
      readFails = error;
    },
    /** Gives the workspace its own authoring skill at `path`, or takes it away with `null`. */
    ownSkill: (path: string | null) => {
      skill = path;
    },
    /** How often "customize skill" asked the host to write the skill. */
    customized: () => customized,
    /** Gives a chat its docs sites and log, told as a change of the chat. */
    setDocs: async (chatId: string, kept: SavedChatDocs) => {
      docs.set(chatId, kept);
      await act(async () => {
        for (const listener of listeners) listener({ kind: "chat", chatId });
      });
    },
    /** A chat's docs sites and log as the host keeps them now. */
    docsOf: (chatId: string) => docs.get(chatId),
    /** How many items the next answers leave to review. */
    leaveToReview: (count: number) => {
      items = count;
    },
  };
}

/**
 * Gives jsdom the `popover` methods the kit's Menu calls; returns the function that takes them
 * away. The tests pick menu items directly, so opening and closing only need to exist.
 */
export function installFakePopover(): () => void {
  const names = ["showPopover", "hidePopover"] as const;
  for (const name of names) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value() {} });
  }
  return () => {
    for (const name of names) Reflect.deleteProperty(HTMLElement.prototype, name);
  };
}

/** jsdom has `<dialog>` but no `showModal()`; opening it is all the dialog tests need. */
export function openDialogsInJsdom(): void {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
}
