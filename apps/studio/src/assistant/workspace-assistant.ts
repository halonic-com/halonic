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
import {
  authoringInstructions,
  authoringSkillPath,
  buildChatTools,
  builtInAuthoringSkill,
  ownAuthoringSkill,
} from "@halonicjs/assistant";
import type { ChatMessage, DefinitionStore, Digest } from "@halonicjs/ports";
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
  ShownItem,
} from "@halonicjs/studio-feature-assistant/api";
import { EngineNotAnswering, WorkspaceUntrusted } from "@halonicjs/studio-shell";
import { type LoadedWorkspace, loadWorkspace, modelAliases } from "@halonicjs/workspace";
import { acceptedFiles, isAuthoringSkillPath } from "./accepted-files.ts";
import { type KeptChat, KeptChats } from "./kept-chats.ts";
import {
  assistantModelOf,
  authoringTurnLimitOf,
  chatSettingsOf,
  deviceModelOf,
  localOnlyOf,
  turnLimitOf,
} from "./workspace-assistant-model.ts";

/** What {@link WorkspaceAssistant} works on. */
export interface WorkspaceAssistantParts {
  /**
   * The workspace's files as saved, changes to review included: what the tools read, and where
   * "customize skill" writes the person's own skill.
   */
  readonly files: DefinitionStore;
  /** The open workspace's changes to review, where the tools write. */
  readonly review: ReviewService;
  readonly digest: Digest;
  /** Whether the workspace is trusted, read on every write. */
  readonly isTrusted: () => boolean;
  /** Answers on the engine's chat service, as the Try it chat does (`answerChatOn`). */
  readonly answerChat: (request: ChatAnswerRequest) => Promise<ChatAnswer>;
  /**
   * Answers a Build chat on the Settings › Assistant model while the workspace isn't trusted,
   * with the authoring tools only and no engine (`authoringChatExecutor`). Absent: such a chat
   * asks for trust, as a model from the workspace does.
   */
  readonly answerAuthoring?:
    | ((request: ChatAnswerRequest, localOnly: boolean) => Promise<ChatAnswer>)
    | undefined;
  /** Calls `listener` each time the workspace's trust changes. Returns the stop. */
  readonly onTrustChange?: ((listener: () => void) => () => void) | undefined;
  /** Settings › Assistant: the model call limit and the person's own model. */
  readonly settings: Pick<HostSettings, "get">;
  /**
   * The window's engine connection: whether the engine answers now, and `onChange`, which calls
   * its listener on each change and returns the stop. Absent: the engine always counts as answering.
   */
  readonly engine?: WorkspaceAssistantEngine | undefined;
  /** The workspace's name, as the window shows it. */
  readonly workspaceName: string;
  /** Opens the window's trust check; absent where there is none. */
  readonly askTrust?: (() => Promise<"trusted" | "declined">) | undefined;
  readonly now?: (() => Date) | undefined;
}

/** The window's engine connection, as {@link WorkspaceAssistant} follows it. */
export interface WorkspaceAssistantEngine {
  readonly answering: () => boolean;
  readonly onChange: (listener: (answering: boolean) => void) => () => void;
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
  readonly #stopEngine: () => void;
  readonly #stopTrust: () => void;
  readonly askTrust: AssistantHost["askTrust"];

  constructor(parts: WorkspaceAssistantParts) {
    this.#parts = parts;
    // A chat's tools go with the chat, deleted or dropped past the 40 (HAL-17294).
    this.#chats = new KeptChats(parts.now ?? (() => new Date()), (chatId) =>
      this.#tools.delete(chatId),
    );
    this.askTrust = parts.askTrust;
    this.#stopReview = parts.review.onDidChange((paths) =>
      this.#changed({ kind: "review", paths }),
    );
    this.#stopEngine =
      parts.engine?.onChange(() => this.#changed({ kind: "engine" })) ?? (() => undefined);
    this.#stopTrust =
      parts.onTrustChange?.(() => this.#changed({ kind: "trust" })) ?? (() => undefined);
  }

  engineAnswering(): boolean {
    return this.#parts.engine?.answering() ?? true;
  }

  workspaceName(): string {
    return this.#parts.workspaceName;
  }

  async authoringOnly(chatId: string): Promise<boolean> {
    if (this.#parts.isTrusted() || this.#parts.answerAuthoring === undefined) return false;
    const chat = this.#chats.get(chatId);
    const loaded = await loadWorkspace(this.#parts.files);
    const settings = chatSettingsOf(chat.model, loaded, this.#parts.settings);
    return chat.kind === "build" && settings.agent !== undefined;
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
   * stops and ends as failed with `EngineNotAnswering` (K3's fallback, states H13). A model from
   * the workspace is refused as `WorkspaceUntrusted` while the workspace isn't trusted, before
   * anything is sent (flow-assistant 5.9, HAL-720). A Build chat on the Settings › Assistant model
   * answers then with the authoring tools only, on no engine (states H17).
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
    const stopWatching = this.#parts.engine?.onChange((answering) => {
      if (answering) return;
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

  savedText(path: string): Promise<string | null> {
    return this.#parts.files.read(path);
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

  async authoringSkill(): Promise<string | null> {
    return ownAuthoringSkill(await loadWorkspace(this.#parts.files))?.path ?? null;
  }

  /** Only writes where no file is: one the workspace can't load is still the person's. */
  async customizeSkill(): Promise<string> {
    const own = await this.authoringSkill();
    if (own !== null) return own;
    await this.#parts.files.write(authoringSkillPath, builtInAuthoringSkill, {
      expected: "absent",
    });
    return authoringSkillPath;
  }

  onDidChange(listener: (change: AssistantChange) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stops listening to the review service; the registry calls it as the workspace closes. */
  dispose(): void {
    this.#stopReview();
    this.#stopEngine();
    this.#stopTrust();
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
    const settings: ChatSettings = chatSettingsOf(chat.model, loaded, this.#parts.settings);
    const answerOn = this.#answererOf(chat, settings, loaded);
    const messages = forTheModel(
      [...chat.messages, ...shownNote(request.shown)],
      sent,
      request.notes ?? [],
    );
    const answer = await answerOn.answer({
      settings,
      messages: chat.kind === "build" ? [await this.#skillOf(loaded), ...messages] : messages,
      tools: this.#toolsOf(chat.id),
      turnLimit: answerOn.turnLimit,
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

  /**
   * Where the answer goes, picked on every Send by where the model comes from, not by its name
   * (HAL-720 condition 1): only the person's own Settings › Assistant model is never written in the
   * workspace. While the workspace isn't trusted, a Build chat on it answers with the authoring
   * tools only, on no engine, and any other model needs trust first. A file the assistant wrote,
   * such as a `models.yaml` alias with the device model's name, changes neither.
   *
   * @throws WorkspaceUntrusted for any other chat while the workspace isn't trusted
   */
  #answererOf(chat: KeptChat, settings: ChatSettings, loaded: LoadedWorkspace) {
    if (this.#parts.isTrusted()) {
      return {
        answer: this.#parts.answerChat,
        turnLimit: turnLimitOf(loaded, this.#parts.settings),
      };
    }
    const authoring = this.#parts.answerAuthoring;
    if (authoring === undefined || settings.agent === undefined || chat.kind !== "build") {
      throw new WorkspaceUntrusted(`${this.#parts.workspaceName} isn't trusted yet.`);
    }
    const localOnly = localOnlyOf(loaded);
    return {
      answer: (request: ChatAnswerRequest) => authoring(request, localOnly),
      turnLimit: authoringTurnLimitOf(loaded, this.#parts.settings),
    };
  }

  /**
   * The Build chat follows the workspace's own authoring skill as accepted, else the built-in one.
   * A skill the assistant proposed steers nothing until the person accepts it (HAL-17357). It isn't
   * kept in the chat, so an edited skill counts from the next answer on.
   */
  async #skillOf(loaded: LoadedWorkspace): Promise<ChatMessage> {
    const items = await this.#parts.review.itemsWithChangesToReview();
    const proposed = items.map((item) => item.path).filter(isAuthoringSkillPath);
    const accepted =
      proposed.length === 0
        ? loaded
        : await loadWorkspace(await acceptedFiles(this.#parts.files, this.#parts.review, proposed));
    return { role: "system", content: authoringInstructions(accepted) };
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

/**
 * What Show in chat put in the chat, told to the model with this answer only (flow-assistant 5.7):
 * a note before the person's message, never kept, so a removed chip is gone from the next one.
 */
function shownNote(shown: readonly ShownItem[] | undefined): ChatMessage[] {
  if (shown === undefined || shown.length === 0) return [];
  const items = shown.map(({ item, name }) => `${item.kind} "${name}" (${item.hub}/${item.id})`);
  return [{ role: "system", content: `The person showed you these items: ${items.join(", ")}.` }];
}

/**
 * What the model reads: the chat, then the person's message with the notes on the cards they
 * decided before it (flow-assistant 3.3). The notes aren't kept: the cards already say it.
 */
function forTheModel(
  kept: readonly ChatMessage[],
  sent: ChatMessage | undefined,
  notes: readonly string[],
): readonly ChatMessage[] {
  if (notes.length === 0) return sent === undefined ? kept : [...kept, sent];
  const said = notes.join("\n");
  if (sent === undefined) return [...kept, { role: "user", content: said }];
  return [...kept, { role: "user", content: `${said}\n\n${sent.content}` }];
}
