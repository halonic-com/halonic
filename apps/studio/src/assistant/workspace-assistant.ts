import {
  type ChatAnswer,
  type ChatAnswerRequest,
  type ChatSettings,
  type ChatTool,
  type FileReview,
  type HostSettings,
  type ItemToReview,
  maxTurnLimit,
  type ReviewCard,
  type ReviewOutcome,
  type ReviewService,
  type ReviewStep,
  type ReviewTarget,
} from "@halonicjs/app";
import {
  authoringInstructions,
  authoringSkillPath,
  buildChatTools,
  builtInAuthoringSkill,
  ownAuthoringSkill,
  type ShowOutcome,
  sheetHostsNamedIn,
  toolsWhilePageLoaded,
} from "@halonicjs/assistant";
import type { ChatMessage, DefinitionStore, Digest } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type {
  AssistantAnswer,
  AssistantAnswerRequest,
  AssistantChange,
  AssistantHost,
  Chat,
  ChatAbout,
  ChatAgent,
  ChatKind,
  ChatModel,
  ChatSummary,
  ModelOption,
} from "@halonicjs/studio-feature-assistant/api";
import { EngineNotAnswering, type ItemRef, WorkspaceUntrusted } from "@halonicjs/studio-shell";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { acceptedFiles, isAuthoringSkillPath } from "./accepted-files.ts";
import { answerWithFailure } from "./chat-failure.ts";
import { agentOfKind, chatAgentsOf, type HasKey, modelOptionsOf } from "./chat-models.ts";
import { forTheModel } from "./for-the-model.ts";
import { type ChatStore, type KeptChat, KeptChats } from "./kept-chats.ts";
import {
  assistantModelOf,
  authoringTurnLimitOf,
  type ChatModelParts,
  chatSettingsOf,
  deviceModelOf,
  localOnlyOf,
  shownNote,
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
  /** Where the workspace's chats are saved, so they come back when it opens again. */
  readonly chats: ChatStore;
  /** Opens the window's trust check; absent where there is none. */
  readonly askTrust?: (() => Promise<"trusted" | "declined">) | undefined;
  /** Whether a key is stored under a secret's name, for the Model menu's reasons. */
  readonly hasKey?: HasKey | undefined;
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
  /** How each answering chat's `show` tool shows an item: the window of the answer's panel. */
  readonly #shows = new Map<string, NonNullable<AssistantAnswerRequest["show"]>>();
  readonly #listeners = new Set<(change: AssistantChange) => void>();
  readonly #stopReview: () => void;
  readonly #stopEngine: () => void;
  readonly #stopTrust: () => void;
  readonly askTrust: AssistantHost["askTrust"];

  constructor(parts: WorkspaceAssistantParts) {
    this.#parts = parts;
    // A chat's tools go with the chat, deleted or dropped past the 40 (HAL-17294).
    this.#chats = new KeptChats({
      store: parts.chats,
      now: parts.now ?? (() => new Date()),
      onGone: (chatId) => this.#tools.delete(chatId),
      onSaveFailed: (error) => console.error("Saving a chat", error),
    });
    this.askTrust = parts.askTrust;
    const stopListening = parts.review.onDidChange((paths) =>
      this.#changed({ kind: "review", paths }),
    );
    // Accept marks the hosts a change adds that the person didn't name in its chat (HAL-525).
    const stopNaming = parts.review.readHostsNamedWith(async (chatId) =>
      sheetHostsNamedIn(await this.#personMessages(chatId)),
    );
    this.#stopReview = () => {
      stopListening();
      stopNaming();
    };
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
    const chat = await this.#chats.get(chatId);
    const loaded = await loadWorkspace(this.#parts.files);
    const settings = chatSettingsOf(chat.model, loaded, this.#parts.settings);
    return chat.kind === "build" && settings.agent !== undefined;
  }

  async chats(): Promise<readonly ChatSummary[]> {
    const items = await this.#parts.review.itemsWithChangesToReview();
    return (await this.#chats.list()).map((chat) => this.#summaryOf(chat, items));
  }

  async chat(chatId: string): Promise<Chat> {
    const chat = await this.#chats.get(chatId);
    const items = await this.#parts.review.itemsWithChangesToReview();
    return { ...this.#summaryOf(chat, items), ...chat };
  }

  /** A new chat starts on the model of flow-assistant 5.2's order. */
  async newChat(kind: ChatKind, about?: ChatAbout): Promise<Chat> {
    const loaded = await loadWorkspace(this.#parts.files);
    const recent = (await this.#chats.list()).find((chat) => chat.kind === "build");
    const model: ChatModel =
      assistantModelOf(loaded) !== null || deviceModelOf(this.#parts.settings) !== undefined
        ? { kind: "assistant" }
        : (recent?.model ?? { kind: "alias", name: "default" });
    return this.chat((await this.#chats.newChat(kind, model, about)).id);
  }

  /**
   * Answers in the chat. The person's message is kept once the engine took the answer, so a
   * refused one leaves the chat as it was. When the shell finds the engine stopped, the answer
   * stops and ends as failed with `EngineNotAnswering` (K3's fallback, states H13). A model from
   * the workspace is refused as `WorkspaceUntrusted` while the workspace isn't trusted, before
   * anything is sent (flow-assistant 5.9, HAL-720). A Build chat on the Settings › Assistant model
   * answers then with the authoring tools only, on no engine (states H17).
   */
  async answer(request: AssistantAnswerRequest): Promise<AssistantAnswer> {
    const chat = await this.#chats.get(request.chatId);
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
    this.#chats.answering(chat.id, true);
    if (request.show !== undefined) this.#shows.set(chat.id, request.show);
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
      this.#chats.answering(chat.id, false);
      this.#shows.delete(chat.id);
      this.#changed({ kind: "chats" });
    }
  }

  async rename(chatId: string, title: string): Promise<void> {
    if (title.trim() === "") throw new KindedError("invalid_input", "A chat needs a title.");
    await this.#chats.change(chatId, { title: title.trim() });
    this.#changed({ kind: "chats" });
  }

  async deleteChat(chatId: string): Promise<void> {
    await this.#chats.delete(chatId);
    this.#changed({ kind: "chats" });
  }

  async setModel(chatId: string, model: ChatModel): Promise<void> {
    await this.#chats.change(chatId, { model });
    this.#changed({ kind: "chat", chatId });
  }

  /** The Assistant model first when one is set, then the aliases by name, each with its problem. */
  async models(): Promise<readonly ModelOption[]> {
    const loaded = await loadWorkspace(this.#parts.files);
    return modelOptionsOf(loaded, this.#parts.settings, this.#parts.hasKey ?? (async () => true));
  }

  async agents(): Promise<readonly ChatAgent[]> {
    return chatAgentsOf(await loadWorkspace(this.#parts.files));
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

  /** Waits for the chats' saves and deletes started so far, as before the window closes. */
  saved(): Promise<void> {
    return this.#chats.saved();
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
    // Trust first: an untrusted workspace refuses an agent chat before its file is read.
    const buildSettings = chatSettingsOf(chat.model, loaded, this.#parts.settings);
    const answerOn = this.#answererOf(chat, buildSettings, loaded);
    const model = this.#modelOf(chat, loaded);
    const messages = forTheModel(
      [...chat.messages, ...shownNote(request.shown)],
      sent,
      request.notes ?? [],
    );
    const answer = await answerOn.answer({
      ...model,
      messages: chat.kind === "build" ? [await this.#skillOf(loaded), ...messages] : messages,
      turnLimit: model.turnLimit ?? answerOn.turnLimit,
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
    return answerWithFailure(answer, model.settings, loaded);
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

  /**
   * The model and tools of one answer, and an agent chat's model call limit. An agent chat answers as the agent's Try
   * it chat does (flow-assistant 5.3): its own model, instructions and skills, no authoring tools.
   */
  #modelOf(chat: KeptChat, loaded: LoadedWorkspace): ChatModelParts {
    const agent = agentOfKind(chat.kind);
    if (agent === undefined) {
      // The Build chat's model call limit depends on trust, so `#answererOf` picks it.
      return {
        settings: chatSettingsOf(chat.model, loaded, this.#parts.settings),
        tools: this.#toolsOf(chat.id),
        offerTools: toolsWhilePageLoaded,
      };
    }
    const file = filesOf(loaded, "agent").find(
      (each) => each.hub === agent.hubId && each.value.id === agent.agentId,
    );
    if (file === undefined) {
      throw new KindedError("not_found", "This agent isn't in this workspace any more.");
    }
    return {
      settings: { hubId: agent.hubId, agentId: agent.agentId },
      tools: [],
      // The file allows up to 200 model calls; a chat answer stops at 64 turns.
      turnLimit: Math.min(file.value.maxSteps, maxTurnLimit),
    };
  }

  /** The chat's tools, made once to remember what the model read; `show` uses `#shows`. */
  #toolsOf(chatId: string): readonly ChatTool[] {
    const { files, review, isTrusted, digest } = this.#parts;
    let tools = this.#tools.get(chatId);
    if (tools === undefined) {
      const show = async (item: ItemRef): Promise<ShowOutcome> =>
        this.#shows.get(chatId)?.(item) ?? "nowhere";
      const personMessages = () => this.#personMessages(chatId);
      tools = buildChatTools({ chatId, files, review, isTrusted, digest, show, personMessages });
      this.#tools.set(chatId, tools);
    }
    // Before trust a turn offers exactly the six authoring tools (`studio.assistant-authoring-turn`),
    // so `show` and `integration_guide` wait for trust.
    const afterTrust = ["show", "integration_guide"];
    return isTrusted() ? tools : tools.filter((tool) => !afterTrust.includes(tool.definition.name));
  }

  /**
   * The person's own messages in a chat: what the Build chat's gate and the "added by the
   * assistant" mark count as named. The message sent is kept before the first model turn, so a
   * write in it reads it.
   */
  async #personMessages(chatId: string): Promise<string[]> {
    const { messages } = await this.#chats.get(chatId);
    return messages.flatMap((m) => (m.role === "user" ? [m.content] : []));
  }

  #add(chatId: string, message: ChatMessage): void {
    this.#chats.add(chatId, message);
    this.#changed({ kind: "chat", chatId });
    this.#changed({ kind: "chats" });
  }

  #summaryOf(chat: KeptChat, items: readonly ItemToReview[]): ChatSummary {
    const { id, kind, title, lastUsedAt, about } = chat;
    const itemsToReview = items.filter((item) => item.card.chatId === id).length;
    const answering = this.#answering.has(id);
    return { id, kind, title, lastUsedAt, answering, itemsToReview, about };
  }

  #changed(change: AssistantChange): void {
    for (const listener of [...this.#listeners]) listener(change);
  }
}
