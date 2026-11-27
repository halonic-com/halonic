import type { ShowOutcome } from "@halonicjs/assistant";
import type { ChatMessage, ToolCall } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { type ItemRef, isUntrustedRefusal, type ShownInWindow } from "@halonicjs/studio-shell";
import type { AssistantHost, Chat, ChatAbout, ChatKind, ChatModel, ShownItem } from "../api.ts";
import { cardReviewsOf } from "../cards/card-reviews.ts";
import { buildChatWords } from "./build-chat-words.ts";
import { endOf, endOfError, isSameItem, loadFailure, viewOf, withShown } from "./chat-view.ts";
import { HomeHold } from "./home-hold.ts";
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
  /**
   * Asks the box to take focus, and to hold `text` when it is given: the New workflow dialog's
   * Describe link and "Ask about this <kind>…" (flow-workflows 2.2, flow-assistant 10). A new
   * object asks again; the box asks once per object.
   */
  readonly boxRequest?: { readonly text?: string | undefined } | undefined;
  /** The box's own placeholder for this chat, such as "Ask about this <kind>…" gives it (HAL-18155). */
  readonly placeholder?: string | undefined;
}

/** What {@link BuildChats.newChatAsking} puts in the new chat's box. */
export interface BoxAsk {
  /** The text the box holds. */
  readonly text?: string | undefined;
  /** The box's placeholder for as long as this session shows the chat. */
  readonly placeholder?: string | undefined;
}

/** What else {@link BuildChats.send} is given. */
export interface SendOptions {
  /** Gets the message when the host refused it because the workspace isn't trusted (H16). */
  readonly refused?: ((message: string | undefined) => void) | undefined;
  /** The window's `showItem`, for the Build chat's `show` tool; absent where there is none. */
  readonly showItem?: ((item: ItemRef) => ShownInWindow) | undefined;
}

/** What the panel shows: a chat, its first load, a chat that can't load, or none (H3). */
export type Shown =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "none" }
  | { readonly kind: "chat"; readonly view: ChatView };

/**
 * The Build chats of one open workspace in this session: which one the panel shows, which ones are
 * open as tabs, and each one shown so far. A chat shown before shows again at once, where it got to
 * (H8), and an answer goes on while the panel is closed or shows another chat, so Stop still
 * reaches it. One chat is in one place at a time: the panel or its tab (flow-assistant 1).
 */
export class BuildChats {
  private readonly host: AssistantHost;
  private readonly views = new Map<string, ChatView>();
  private readonly stoppers = new Map<string, AbortController>();
  private readonly listeners = new Set<() => void>();
  /** The chats open as tabs (`assistant.chat.open-as-tab`). */
  private readonly tabbed = new Set<string>();
  /** The chat Home's content pane holds (`assistant.home.chats`). */
  readonly home = new HomeHold();
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
   * Shows the chat the panel showed last, else the most recently used one not open as a tab, else
   * a new Build chat (`assistant.chat.panel-shortcut`).
   */
  async open(): Promise<void> {
    const shown = this.currentId === undefined ? undefined : this.views.get(this.currentId);
    if (shown !== undefined) return this.show({ kind: "chat", view: shown });
    await this.load(async () => {
      if (this.currentId !== undefined) return this.host.chat(this.currentId);
      const recent = (await this.host.chats()).find(
        (chat) => !this.tabbed.has(chat.id) && chat.id !== this.home.held(),
      );
      return recent === undefined ? this.host.newChat("build") : this.host.chat(recent.id);
    });
  }

  /** Shows one kept chat: a replaced card's **Go to it** opens the chat with the newer card. */
  async openChat(chatId: string): Promise<void> {
    await this.load(() => this.host.chat(chatId));
  }

  /** A chat as this session shows it, once the panel or its tab has read it. */
  viewOf = (chatId: string): ChatView | undefined => this.views.get(chatId);

  /** Reads a chat for its tab, unless it was read before; fails as the host does. */
  async read(chatId: string): Promise<void> {
    if (this.views.has(chatId)) return;
    const chat = await this.host.chat(chatId);
    if (!this.views.has(chat.id)) this.views.set(chat.id, viewOf(chat));
    this.changed();
  }

  /** Whether the chat is open as a tab, so its tab stays open (`shell.gone-item-tabs`). */
  inTab(chatId: string): boolean {
    return this.tabbed.has(chatId);
  }

  /**
   * Moves a chat into its tab (`assistant.chat.open-as-tab`): the panel no longer shows it and
   * opens on another one next time. Its shown items go along, since they belong to the chat.
   */
  moveToTab(chatId: string): void {
    this.home.leave(chatId);
    this.tabbed.add(chatId);
    this.leavePanel(chatId);
  }

  /**
   * Holds a chat in Home's content pane: the panel and its tab let go of it. Returns the function
   * that gives it back, after which it is an ordinary panel chat again.
   */
  holdInHome(chatId: string): () => void {
    this.tabbed.delete(chatId);
    const release = this.home.hold(chatId);
    this.leavePanel(chatId);
    return release;
  }

  /**
   * Moves a chat from its tab back to the panel (Continue in the side panel): the panel shows it,
   * and its tab closes, the way a gone item's tab does.
   */
  moveToPanel(chatId: string): void {
    const view = this.views.get(chatId);
    this.tabbed.delete(chatId);
    if (view === undefined) {
      this.changed();
    } else {
      this.currentId = chatId;
      this.show({ kind: "chat", view });
    }
  }

  /**
   * Shows a new chat of `kind`, a Build chat unless named, about `about` when given, or the empty
   * draft there is already.
   */
  async newChat(kind: ChatKind = "build", about?: ChatAbout): Promise<void> {
    await this.load(() => this.host.newChat(kind, about));
  }

  /**
   * Shows a new Build chat (or the empty draft there is) about `about`, or about no item when
   * absent, and asks its box for focus, holding `ask.text` when given; `ask.placeholder` becomes
   * the box's placeholder when given.
   */
  async newChatAsking(about: ChatAbout | undefined, ask: BoxAsk = {}): Promise<void> {
    await this.newChat("build", about);
    if (this.state.kind !== "chat") return;
    const { text, placeholder } = ask;
    this.update(this.state.view.chat.id, (view) => ({
      boxRequest: { text },
      placeholder: placeholder ?? view.placeholder,
    }));
  }

  /** The box did what {@link newChatAsking} asked: a box drawn again later doesn't do it again. */
  clearBoxRequest(chatId: string): void {
    if (this.views.get(chatId)?.boxRequest === undefined) return;
    this.update(chatId, () => ({ boxRequest: undefined }));
  }

  /**
   * Chat with: talks to `kind` from now on (`assistant.chat.switch-build-or-agent`). A chat's kind
   * never changes, so this shows a new chat of `kind`, and the chat shown stays in the recent chats
   * when it has messages.
   */
  async chatWith(kind: ChatKind): Promise<void> {
    if (this.state.kind === "chat" && this.state.view.chat.kind === kind) return;
    await this.newChat(kind);
  }

  /** Changes the model of a chat, and only of it (`assistant.chat.model-per-chat`). */
  async setModel(chatId: string, model: ChatModel, announce: Announce): Promise<void> {
    try {
      await this.host.setModel(chatId, model);
    } catch (error) {
      announce(error instanceof Error ? error.message : String(error), "assertive");
      return;
    }
    this.update(chatId, (now) => ({ chat: { ...now.chat, model } }));
  }

  /**
   * Puts `shown` in the chat the panel shows, else in a new Build chat; an item already there
   * isn't added twice (`assistant.chat.show-in-chat`).
   */
  async showItem(shown: ShownItem): Promise<void> {
    if (this.currentId === undefined || !this.views.has(this.currentId)) await this.newChat();
    if (this.currentId !== undefined) this.addShown(this.currentId, shown);
  }

  /** Puts `shown` in a chat, unless it's there already. */
  addShown(chatId: string, shown: ShownItem): void {
    this.update(chatId, (view) => withShown(view, shown));
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

  /** Takes `shown` out of a chat: its chip's ×. */
  removeShown(chatId: string, shown: ShownItem): void {
    this.update(chatId, (view) => ({
      shown: view.shown.filter((each) => !isSameItem(each, shown)),
    }));
  }

  /**
   * Sends `message` in a chat, or, without one, continues the answer that reached the
   * model call limit (flow-assistant 3.6) or tries a failed one again. Says once how it ended.
   * When the host refuses it because the workspace isn't trusted, nothing was sent (H16): the chat
   * goes back to how it was, nothing is announced, and `refused` gets the message. The model's
   * `show` shows items with `showItem` (`assistant.build.show-tool`).
   */
  async send(
    chatId: string,
    message: string | undefined,
    announce: Announce,
    { refused, showItem }: SendOptions = {},
  ): Promise<void> {
    const view = this.views.get(chatId);
    if (view === undefined || view.answering) return;
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
        notes: cardReviewsOf(this.host).takeNotes(chatId),
        show: showItem && (async (item) => this.showFor(chatId, item, showItem)),
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
      end = endOf(answer);
    } catch (error) {
      if (isUntrustedRefusal(error)) {
        this.takeBack(view);
        refused?.(message);
        return;
      }
      end = endOfError(error, this.toolsRanSince(chatId, view.messages.length));
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

  /**
   * Shows an item the model's `show` asked for next to the chat, without moving the focus, and
   * puts it in that chat's shown items once (flow-assistant 5.7).
   */
  private showFor(
    chatId: string,
    item: ItemRef,
    showItem: (item: ItemRef) => ShownInWindow,
  ): ShowOutcome {
    const placed = showItem(item);
    if (placed.placed === "unknown") return "unknown";
    this.update(chatId, (view) => withShown(view, { item, name: placed.name }));
    return "shown";
  }

  /** Puts a chat back as it was before a message the host refused, which sent nothing. */
  private takeBack(before: ChatView): void {
    this.stoppers.delete(before.chat.id);
    const { messages, ends } = before;
    this.update(before.chat.id, () => ({ messages, ends, answering: false }));
  }

  /** Shows a kept chat picked in the chat menu, where it got to when shown before (flow 5.5). */
  async pick(chatId: string): Promise<void> {
    const shown = this.views.get(chatId);
    if (shown !== undefined) {
      this.currentId = chatId;
      return this.show({ kind: "chat", view: shown });
    }
    await this.load(() => this.host.chat(chatId));
  }

  /**
   * Renames a chat (`assistant.chat.rename`): the title trimmed, and an empty one keeps the old
   * title.
   */
  async rename(chatId: string, title: string): Promise<void> {
    if (title.trim() === "") return;
    await this.host.rename(chatId, title);
    await this.refresh(chatId);
  }

  /**
   * Deletes a chat (`assistant.chat.delete`), stopping its answer: the panel shows no chat (H3),
   * and its tab closes. Its changes to review stay in the items.
   */
  async deleteChat(chatId: string): Promise<void> {
    await this.host.deleteChat(chatId);
    this.stoppers.get(chatId)?.abort();
    this.views.delete(chatId);
    this.tabbed.delete(chatId);
    this.home.leave(chatId);
    this.leavePanel(chatId);
  }

  /** Stops a chat's answer; it ends with "Stopped by you.". */
  stop(chatId: string): void {
    this.stoppers.get(chatId)?.abort();
  }

  /** Whether a tool answered after the chat's first `count` messages. */
  private toolsRanSince(chatId: string, count: number): boolean {
    const messages = this.views.get(chatId)?.messages ?? [];
    return messages.slice(count).some((each) => each.role === "tool");
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
      this.show({ kind: "failed", reason: loadFailure(error) });
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
    // A chat deleted while it answered says nothing more: its place already shows no chat.
    if (!this.views.has(chatId)) return;
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
    else this.changed();
  }

  private show(state: Shown): void {
    // The panel shows the chat now, so Home no longer holds it.
    if (state.kind === "chat") this.home.leave(state.view.chat.id);
    this.state = state;
    this.changed();
  }

  /** The panel shows no chat (H3) if it showed `chatId`, which went to its tab or was deleted. */
  private leavePanel(chatId: string): void {
    if (this.currentId !== chatId) {
      this.changed();
      return;
    }
    this.currentId = undefined;
    this.show({ kind: "none" });
  }

  /** Tells the panel and the tabs that a chat, or where it is, changed. */
  private changed(): void {
    for (const listener of this.listeners) listener();
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
