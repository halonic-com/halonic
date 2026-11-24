import type {
  ChatAnswer,
  ChatAnswerRequest,
  ChatSettings,
  ChatTool,
  FileReview,
  HostSettings,
  ItemToReview,
  ReviewCard,
  ReviewOutcome,
  ReviewService,
  ReviewStep,
  ReviewTarget,
} from "@halonicjs/app";
import { buildChatTools } from "@halonicjs/assistant";
import type { ChatMessage, DefinitionSource, Digest } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type {
  AssistantAnswerRequest,
  AssistantChange,
  AssistantHost,
  Chat,
  ChatKind,
  ChatModel,
  ChatSummary,
  ModelOption,
} from "@halonicjs/studio-feature-assistant/api";
import { EngineNotAnswering } from "@halonicjs/studio-shell";
import { type LoadedWorkspace, loadWorkspace, modelAliases } from "@halonicjs/workspace";
import { type KeptChat, KeptChats } from "./kept-chats.ts";
import {
  assistantModelOf,
  chatSettingsOf,
  deviceModelOf,
  turnLimitOf,
} from "./workspace-assistant-model.ts";

/** What {@link WorkspaceAssistant} works on. */
export interface WorkspaceAssistantParts {
  /** The workspace's files as saved, changes to review included: what the tools read. */
  readonly files: DefinitionSource;
  /** The open workspace's changes to review, where the tools write. */
  readonly review: ReviewService;
  readonly digest: Digest;
  /** Whether the workspace is trusted, read on every write. */
  readonly isTrusted: () => boolean;
  /** Answers on the engine's chat service, as the Try it chat does (`answerChatOn`). */
  readonly answerChat: (request: ChatAnswerRequest) => Promise<ChatAnswer>;
  /** Settings › Assistant: the model call limit and the person's own model. */
  readonly settings: Pick<HostSettings, "get">;
  /** Calls `listener` when the shell finds the engine stopped answering. Returns the stop. */
  readonly onEngineStopped?: ((listener: () => void) => () => void) | undefined;
  readonly now?: (() => Date) | undefined;
}

/**
 * The Assistant of one open workspace (`studio.workspace-assistant`): its chats, each answer on
 * the engine's chat service with the Build chat's tools and the Settings › Assistant model call
 * limit, and the changes to review those tools write.
 */
export class WorkspaceAssistant implements AssistantHost {
  readonly #parts: WorkspaceAssistantParts;
  readonly #chats: KeptChats;
  readonly #tools = new Map<string, readonly ChatTool[]>();
  readonly #answering = new Set<string>();
  readonly #listeners = new Set<(change: AssistantChange) => void>();
  readonly #stopReview: () => void;

  constructor(parts: WorkspaceAssistantParts) {
    this.#parts = parts;
    // A chat's tools go with the chat, deleted or dropped past the 40 (HAL-17294).
    this.#chats = new KeptChats(parts.now ?? (() => new Date()), (chatId) =>
      this.#tools.delete(chatId),
    );
    this.#stopReview = parts.review.onDidChange((paths) =>
      this.#changed({ kind: "review", paths }),
    );
  }

  async chats(): Promise<readonly ChatSummary[]> {
    const items = await this.#parts.review.itemsWithChangesToReview();
    return this.#chats.list().map((chat) => this.#summaryOf(chat, items));
  }

  async chat(chatId: string): Promise<Chat> {
    const chat = this.#chats.get(chatId);
    const items = await this.#parts.review.itemsWithChangesToReview();
    return { ...this.#summaryOf(chat, items), ...chat, stoppedWhenClosed: false };
  }

  /** A new chat starts on the model of flow-assistant 5.2's order. */
  async newChat(kind: ChatKind): Promise<Chat> {
    const loaded = await loadWorkspace(this.#parts.files);
    const recent = this.#chats.list().find((chat) => chat.kind === "build");
    const model: ChatModel =
      assistantModelOf(loaded) !== null || deviceModelOf(this.#parts.settings) !== undefined
        ? { kind: "assistant" }
        : (recent?.model ?? { kind: "alias", name: "default" });
    return this.chat(this.#chats.newChat(kind, model).id);
  }

  /**
   * Answers in the chat. The person's message is kept once the engine took the answer, so a
   * refused one leaves the chat as it was. When the shell finds the engine stopped, the answer
   * stops and ends as failed with `EngineNotAnswering` (K3's fallback, states H13).
   */
  async answer(request: AssistantAnswerRequest): Promise<ChatAnswer> {
    const chat = this.#chats.get(request.chatId);
    if (this.#answering.has(chat.id)) {
      throw new KindedError("conflict", "This chat is already answering.");
    }
    const stopper = new AbortController();
    const stop = () => stopper.abort();
    request.signal?.addEventListener("abort", stop);
    if (request.signal?.aborted) stop();
    let engineStopped = false;
    const stopWatching = this.#parts.onEngineStopped?.(() => {
      engineStopped = true;
      stop();
    });
    this.#answering.add(chat.id);
    this.#changed({ kind: "chats" });
    try {
      const answer = await this.#answerOn(chat, request, stopper.signal);
      if (!engineStopped || answer.end.reason !== "stopped") return answer;
      const error = new EngineNotAnswering();
      return { ...answer, end: { reason: "failed", error, toolsRan: answer.end.toolsRan } };
    } finally {
      request.signal?.removeEventListener("abort", stop);
      stopWatching?.();
      this.#answering.delete(chat.id);
      this.#changed({ kind: "chats" });
    }
  }

  async rename(chatId: string, title: string): Promise<void> {
    if (title.trim() === "") throw new KindedError("invalid_input", "A chat needs a title.");
    this.#chats.change(chatId, { title: title.trim() });
    this.#changed({ kind: "chats" });
  }

  async deleteChat(chatId: string): Promise<void> {
    this.#chats.delete(chatId);
    this.#changed({ kind: "chats" });
  }

  async setModel(chatId: string, model: ChatModel): Promise<void> {
    this.#chats.change(chatId, { model });
    this.#changed({ kind: "chat", chatId });
  }

  /** The Assistant model first when one is set, then the aliases by name; reasons come later (T14 PR 11). */
  async models(): Promise<readonly ModelOption[]> {
    const loaded = await loadWorkspace(this.#parts.files);
    const own = assistantModelOf(loaded);
    const device = deviceModelOf(this.#parts.settings);
    const assistant: ModelOption[] = [];
    if (own !== null) {
      assistant.push({
        model: { kind: "assistant" },
        label: own,
        from: "workspace",
        problem: null,
      });
    } else if (device !== undefined) {
      const label = device.model;
      assistant.push({ model: { kind: "assistant" }, label, from: "settings", problem: null });
    }
    const aliases = [...modelAliases(loaded, null).keys()].sort().map(
      (name): ModelOption => ({
        model: { kind: "alias", name },
        label: name,
        from: "workspace",
        problem: null,
      }),
    );
    return [...assistant, ...aliases];
  }

  async itemsToReview(chatId?: string): Promise<readonly ItemToReview[]> {
    const items = await this.#parts.review.itemsWithChangesToReview();
    return chatId === undefined ? items : items.filter((item) => item.card.chatId === chatId);
  }

  changesForCard(card: ReviewCard): Promise<readonly FileReview[]> {
    return this.#parts.review.changesForCard(card);
  }

  changesIn(path: string): Promise<FileReview | null> {
    return this.#parts.review.changesIn(path);
  }

  accept(target: ReviewTarget): Promise<ReviewOutcome> {
    return this.#parts.review.accept(target);
  }

  reject(target: ReviewTarget): Promise<ReviewOutcome> {
    return this.#parts.review.reject(target);
  }

  undo(step: ReviewStep): Promise<ReviewOutcome> {
    return this.#parts.review.restore(step, "before");
  }

  onDidChange(listener: (change: AssistantChange) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stops listening to the review service; the registry calls it as the workspace closes. */
  dispose(): void {
    this.#stopReview();
    this.#listeners.clear();
  }

  async #answerOn(chat: KeptChat, request: AssistantAnswerRequest, signal: AbortSignal) {
    const loaded: LoadedWorkspace = await loadWorkspace(this.#parts.files);
    const sent: ChatMessage | undefined =
      request.message === undefined ? undefined : { role: "user", content: request.message };
    let keepSent = sent;
    const keep = (message?: ChatMessage) => {
      if (keepSent !== undefined) this.#add(chat.id, keepSent);
      keepSent = undefined;
      if (message !== undefined) this.#add(chat.id, message);
    };
    const own = request.listener;
    const answer = await this.#parts.answerChat({
      settings: chatSettingsOf(chat.model, loaded, this.#parts.settings) satisfies ChatSettings,
      messages: sent === undefined ? chat.messages : [...chat.messages, sent],
      tools: this.#toolsOf(chat.id),
      turnLimit: turnLimitOf(loaded, this.#parts.settings),
      signal,
      listener: {
        onTurn: (turn) => {
          keep();
          own?.onTurn?.(turn);
        },
        onToolCall: (call) => own?.onToolCall?.(call),
        onMessage: (message) => {
          keep(message);
          own?.onMessage?.(message);
        },
        onRefusals: (refusals) => own?.onRefusals?.(refusals),
        onToolFailures: (failures) => own?.onToolFailures?.(failures),
        onWaiting: (waiting) => own?.onWaiting?.(waiting),
      },
    });
    keep();
    return answer;
  }

  /** The chat's tools, made once, so they remember what the model read in it. */
  #toolsOf(chatId: string): readonly ChatTool[] {
    let tools = this.#tools.get(chatId);
    if (tools === undefined) {
      const { files, review, isTrusted, digest } = this.#parts;
      tools = buildChatTools({ chatId, files, review, isTrusted, digest });
      this.#tools.set(chatId, tools);
    }
    return tools;
  }

  #add(chatId: string, message: ChatMessage): void {
    this.#chats.add(chatId, message);
    this.#changed({ kind: "chat", chatId });
    this.#changed({ kind: "chats" });
  }

  #summaryOf(chat: KeptChat, items: readonly ItemToReview[]): ChatSummary {
    const { id, kind, title, lastUsedAt } = chat;
    const itemsToReview = items.filter((item) => item.card.chatId === id).length;
    return { id, kind, title, lastUsedAt, answering: this.#answering.has(id), itemsToReview };
  }

  #changed(change: AssistantChange): void {
    for (const listener of [...this.#listeners]) listener(change);
  }
}
