import type { ChatAnswerEnd } from "@halonicjs/app";
import type { ChatMessage, ToolCall } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { EngineNotAnswering } from "@halonicjs/studio-shell";
import type { AssistantHost, Chat, ShownItem } from "../api.ts";
import { buildChatWords } from "./build-chat-words.ts";
import { endLine, type ReplyEnd } from "./turns.ts";

/** Reads a sentence out through the shell's announcer. */
export type Announce = (text: string, politeness?: "polite" | "assertive") => void;

/** One chat as the panel shows it: what the host keeps, and what this session saw happen. */
export interface ChatView {
  readonly chat: Chat;
  readonly messages: readonly ChatMessage[];
  readonly answering: boolean;
  /** The tool call running now, for the status line. */
  readonly tool: ToolCall | undefined;
  /** How each turn ended, by its place; only what this session saw. */
  readonly ends: ReadonlyMap<number, ReplyEnd>;
  /** The last answer was stopped by the person: the status line says so until the next one. */
  readonly stoppedByYou: boolean;
  /** What Show in chat put in this chat, oldest first; kept for this session (flow 5.7). */
  readonly shown: readonly ShownItem[];
}

/** What the panel shows: a chat, its first load, a chat that can't load, or none (H3). */
export type Shown =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "none" }
  | { readonly kind: "chat"; readonly view: ChatView };

/**
 * The Build chats of one open workspace in this session: which one the panel shows, and each one
 * shown so far. A chat shown before shows again at once, where it got to (H8), and an answer goes
 * on while the panel is closed or shows another chat, so Stop still reaches it.
 */
export class BuildChats {
  private readonly host: AssistantHost;
  private readonly views = new Map<string, ChatView>();
  private readonly stoppers = new Map<string, AbortController>();
  private readonly listeners = new Set<() => void>();
  private currentId: string | undefined;
  private state: Shown = { kind: "loading" };
  private keepFocus = false;

  constructor(host: AssistantHost) {
    this.host = host;
  }

  /** What the panel shows now; the same object until something changes. */
  shown = (): Shown => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Shows the chat the panel showed last, else the most recently used one, else a new Build chat
   * (`assistant.chat.panel-shortcut`).
   */
  async open(): Promise<void> {
    const shown = this.currentId === undefined ? undefined : this.views.get(this.currentId);
    if (shown !== undefined) return this.show({ kind: "chat", view: shown });
    await this.load(async () => {
      if (this.currentId !== undefined) return this.host.chat(this.currentId);
      const [recent] = await this.host.chats();
      return recent === undefined ? this.host.newChat("build") : this.host.chat(recent.id);
    });
  }

  /** Shows a new Build chat, or the empty draft there is already. */
  async newChat(): Promise<void> {
    await this.load(() => this.host.newChat("build"));
  }

  /**
   * Puts `shown` in the chat the panel shows, else in a new Build chat; an item already there
   * isn't added twice (`assistant.chat.show-in-chat`).
   */
  async showItem(shown: ShownItem): Promise<void> {
    if (this.currentId === undefined || !this.views.has(this.currentId)) await this.newChat();
    if (this.currentId === undefined) return;
    this.update(this.currentId, (view) =>
      view.shown.some((each) => isSameItem(each, shown)) ? {} : { shown: [...view.shown, shown] },
    );
  }

  /** Asks the panel, as it opens next, to leave focus where it is: Show in chat opened it. */
  keepFocusOnOpen(): void {
    this.keepFocus = true;
  }

  /** Whether the panel opening now leaves focus where it is; asks only once. */
  takeKeepFocus(): boolean {
    const keep = this.keepFocus;
    this.keepFocus = false;
    return keep;
  }

  /** Takes `shown` out of the chat the panel shows: its chip's ×. */
  removeShown(shown: ShownItem): void {
    if (this.state.kind !== "chat") return;
    this.update(this.state.view.chat.id, (view) => ({
      shown: view.shown.filter((each) => !isSameItem(each, shown)),
    }));
  }

  /**
   * Sends `message` in the chat shown, or, without one, continues the answer that reached the
   * model call limit (flow-assistant 3.6). Says once how it ended.
   */
  async send(message: string | undefined, announce: Announce): Promise<void> {
    const view = this.state.kind === "chat" ? this.state.view : undefined;
    if (view === undefined || view.answering) return;
    const chatId = view.chat.id;
    const messages =
      message === undefined
        ? view.messages
        : [...view.messages, { role: "user" as const, content: message }];
    const turn = messages.filter((each) => each.role === "user").length - 1;
    const ends = new Map(view.ends);
    ends.delete(turn);
    const stopper = new AbortController();
    this.stoppers.set(chatId, stopper);
    this.update(chatId, () => ({
      messages,
      ends,
      answering: true,
      tool: undefined,
      stoppedByYou: false,
    }));
    let end: ReplyEnd | undefined;
    try {
      const answer = await this.host.answer({
        chatId,
        message,
        shown: view.shown,
        signal: stopper.signal,
        listener: {
          onToolCall: (tool) => this.update(chatId, () => ({ tool })),
          onMessage: (added) =>
            this.update(chatId, (now) => ({
              messages: [...now.messages, added],
              tool:
                added.role === "tool" && added.toolCallId === now.tool?.id ? undefined : now.tool,
            })),
        },
      });
      end = endOf(answer.end);
    } catch (error) {
      const toolsRan = (this.views.get(chatId)?.messages ?? [])
        .slice(view.messages.length)
        .some((each) => each.role === "tool");
      end =
        error instanceof EngineNotAnswering
          ? { kind: "engine-stopped", toolsRan }
          : {
              kind: "failed",
              reason: error instanceof Error ? error.message : String(error),
              toolsRan,
            };
    }
    this.stoppers.delete(chatId);
    this.update(chatId, (now) => ({
      answering: false,
      tool: undefined,
      stoppedByYou: end?.kind === "stopped",
      ends: end === undefined ? now.ends : new Map(now.ends).set(turn, end),
    }));
    await this.refresh(chatId);
    await this.announceEnd(chatId, end, announce);
  }

  /** Stops the answer of the chat shown; it ends with "Stopped by you.". */
  stop(): void {
    if (this.state.kind === "chat") this.stoppers.get(this.state.view.chat.id)?.abort();
  }

  private async load(read: () => Promise<Chat>): Promise<void> {
    this.show({ kind: "loading" });
    try {
      const chat = await read();
      this.currentId = chat.id;
      const view = this.views.get(chat.id) ?? viewOf(chat);
      this.views.set(chat.id, view);
      this.show({ kind: "chat", view });
    } catch (error) {
      if (errorKindOf(error) === "not_found") {
        this.currentId = undefined;
        this.show({ kind: "none" });
        return;
      }
      this.show({ kind: "failed", reason: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Reads the chat again after an answer, for its title and its messages as the host kept them. */
  private async refresh(chatId: string): Promise<void> {
    try {
      const chat = await this.host.chat(chatId);
      this.update(chatId, () => ({ chat, messages: chat.messages }));
    } catch {
      // What the answer showed stays; the next open reads it again.
    }
  }

  private async announceEnd(chatId: string, end: ReplyEnd | undefined, announce: Announce) {
    if (end !== undefined) {
      announce(endLine(end), end.kind === "failed" ? "assertive" : "polite");
      return;
    }
    const items = await this.host.itemsToReview(chatId).then(
      (found) => found.length,
      () => 0,
    );
    announce(buildChatWords.answerFinished(items), "polite");
  }

  private update(chatId: string, change: (view: ChatView) => Partial<ChatView>): void {
    const view = this.views.get(chatId);
    if (view === undefined) return;
    const next = { ...view, ...change(view) };
    this.views.set(chatId, next);
    if (this.currentId === chatId) this.show({ kind: "chat", view: next });
  }

  private show(state: Shown): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

/** The view of a chat just read: a chat that was answering as Halonic closed says so (flow 5.4). */
function viewOf(chat: Chat): ChatView {
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

function isSameItem(one: ShownItem, other: ShownItem): boolean {
  const [a, b] = [one.item, other.item];
  return a.kind === b.kind && a.hub === b.hub && a.id === b.id;
}

function endOf(end: ChatAnswerEnd): ReplyEnd | undefined {
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
      return { kind: "failed", reason: end.error.message, toolsRan: end.toolsRan };
  }
}

const chatsOfHost = new WeakMap<AssistantHost, BuildChats>();

/** The Build chats of the workspace `host` belongs to, one for the whole session. */
export function buildChatsOf(host: AssistantHost): BuildChats {
  let chats = chatsOfHost.get(host);
  if (chats === undefined) {
    chats = new BuildChats(host);
    chatsOfHost.set(host, chats);
  }
  return chats;
}
