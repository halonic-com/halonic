/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `AssistantHostService` for each open workspace; the Assistant's panel,
 * its chat tab and the item pages' changes to review read it (flow-assistant, T14). It lands
 * before any screen uses it (AGENTS.md "interface first").
 */
import type {
  ChatAnswer,
  ChatAnswerListener,
  FileReview,
  ItemToReview,
  ReviewCard,
  ReviewOutcome,
  ReviewStep,
  ReviewTarget,
} from "@halonicjs/app";
import type { RunFailure } from "@halonicjs/app/run-failure";
import type { ShowOutcome } from "@halonicjs/assistant";
import type { ChatMessage, SavedChatAbout, SavedChatDocs } from "@halonicjs/ports";
import {
  type ItemPageChat,
  type ItemRef,
  type ServiceKey,
  serviceKey,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import type { ReactNode } from "react";

/**
 * Who a chat talks to (flow 5.3): `build`, the Build assistant with its authoring tools, or
 * `agent:<hub>/<id>`, one agent as its Try it chat does. A chat's kind never changes: switching a
 * chat that has messages starts a new one.
 */
export type ChatKind = "build" | `agent:${string}`;

/**
 * The model a chat uses (flow 5.2). `assistant` is the Assistant model: the workspace's own when
 * `workspace.yaml` sets one, else the Settings › Assistant model. `alias` is one of the
 * workspace's model aliases, kept by name even after it is removed.
 */
export type ChatModel =
  | { readonly kind: "assistant" }
  | { readonly kind: "alias"; readonly name: string };

/**
 * Why a model can't be used now, as the Model menu and the line under the box say it (flow 5.2,
 * 5.9): it needs a key for `provider`, or it is a cloud model and `workspace` is local only.
 */
export type ModelProblem =
  | { readonly kind: "needs-key"; readonly provider: string; readonly secretName: string }
  | { readonly kind: "local-only"; readonly workspace: string };

/** One entry of a Build chat's Model menu. */
export interface ModelOption {
  readonly model: ChatModel;
  /** The model's id for the Assistant model ("claude-sonnet-5-5"), else the alias' name. */
  readonly label: string;
  /**
   * Where the model comes from, which decides what Send does in a workspace that isn't trusted
   * (flow 5.9, HAL-720): `workspace` asks for trust first; `settings`, the person's own provider,
   * answers with the authoring tools only.
   */
  readonly from: "workspace" | "settings";
  /** Why it can't be used now; `null` when it can. The menu lists it disabled, never hidden. */
  readonly problem: ModelProblem | null;
}

/** One agent of the Chat with menu (flow 5.3). */
export interface ChatAgent {
  /** The kind of a chat with this agent: `agent:<hub>/<id>`. */
  readonly kind: `agent:${string}`;
  readonly name: string;
  readonly description: string | undefined;
  /** The alias the agent answers with: its own `model`, else `default`. */
  readonly model: string;
  /**
   * The agent file's `character.colors` for its orb, highlight then edge; absent picks a pair
   * from the agent's id (flow-agents 4.3).
   */
  readonly colors?: readonly [string, string] | undefined;
}

/**
 * The item a Build chat is about, such as the workflow whose page it sits on (flow 2.4): only its
 * reference, so a renamed item keeps its chats. An agent chat says what it's about through its
 * kind and has none.
 */
export type ChatAbout = SavedChatAbout;

/** Whether `left` and `right` are about the same item: the same kind, hub and id. */
export function sameAbout(left: ChatAbout | undefined, right: ChatAbout | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.kind === right.kind && left.hub === right.hub && left.id === right.id;
}

/** One row of the chat menu (flow 5.5). */
export interface ChatSummary {
  readonly id: string;
  readonly kind: ChatKind;
  /** From the first message (flow 5.4), or the person's own after Rename. */
  readonly title: string;
  /** When a message was last sent or received, as an ISO time. Opening a chat doesn't count. */
  readonly lastUsedAt: string;
  /** True while an answer runs: the row's running dot. */
  readonly answering: boolean;
  /** How many items still have changes to review from this chat: the row's "2 to review". */
  readonly itemsToReview: number;
  /** The item a Build chat is about; absent for a chat about no item. */
  readonly about?: ChatAbout | undefined;
}

/** A chat with its messages, as the panel and the chat tab show it. */
export interface Chat extends ChatSummary {
  /** The model this chat uses. An agent chat uses its agent's model, and this is ignored. */
  readonly model: ChatModel;
  /** The conversation so far, oldest first. Long tool results may be cut, as the model sees them. */
  readonly messages: readonly ChatMessage[];
  /** True until the first message is sent: a draft isn't listed and isn't kept (flow 5.4). */
  readonly draft: boolean;
  /**
   * True when the chat was answering as Halonic closed: it comes back not busy, with the line
   * "Stopped when Halonic closed." (flow 5.4).
   */
  readonly stoppedWhenClosed: boolean;
}

/**
 * An item put in a Build chat with **Show in chat** (flow 5.7): an agent or a workflow, with the
 * name its chip shows.
 */
export interface ShownItem {
  readonly item: ItemRef;
  /** The agent's name or the workflow's, as its page shows it. */
  readonly name: string;
}

/** One answer in a chat. */
export interface AssistantAnswerRequest {
  readonly chatId: string;
  /**
   * The person's new message. Absent continues the last answer after it reached the model call
   * limit (flow 3.6), without a new message.
   */
  readonly message?: string | undefined;
  /**
   * The items shown in the chat. The model is told them with this answer only: they aren't kept
   * as a message (flow 5.7).
   */
  readonly shown?: readonly ShownItem[] | undefined;
  /**
   * What the person decided on the chat's cards since its last message, such as "(The person
   * accepted the changes to <path>.)" (flow-assistant 3.3). The model reads them with this
   * message; the chat doesn't keep or show them, as the cards already say it.
   */
  readonly notes?: readonly string[] | undefined;
  /**
   * Shows an item next to the chat for the Build chat's `show` tool during this answer
   * (`assistant.build.show-tool`), and says how it went. Absent: there is nowhere to show it.
   */
  readonly show?: ((item: ItemRef) => Promise<ShowOutcome>) | undefined;
  /** Aborted when the person clicks Stop. */
  readonly signal?: AbortSignal | undefined;
  /** Told how the answer goes, for the status line and the transcript. */
  readonly listener?: ChatAnswerListener | undefined;
}

/**
 * How an answer went, as the chat service says it. A failed model call the app can name, such as
 * a model it couldn't reach, also gives its facts as a failed run would (`chatFailureOf`), so the
 * chat says the provider's own sentence (states H22, microcopy 22 F7, F8).
 */
export type AssistantAnswer = ChatAnswer & { readonly failure?: RunFailure | undefined };

/**
 * What changed, for {@link AssistantHost.onDidChange}: the list of chats (one added, renamed,
 * deleted, or its answering or to-review state), one chat's messages or model, or the changes to
 * review in some files, whoever made them.
 */
export type AssistantChange =
  | { readonly kind: "chats" }
  | { readonly kind: "chat"; readonly chatId: string }
  | { readonly kind: "review"; readonly paths: readonly string[] }
  /** The engine stopped or started answering: {@link AssistantHost.engineAnswering} changed. */
  | { readonly kind: "engine" }
  /** The workspace was trusted, or its trust removed: {@link AssistantHost.authoringOnly} may change. */
  | { readonly kind: "trust" };

/**
 * The Assistant of the open workspace, as the app runs it. The app keeps the chats (each
 * workspace's 40 most recently used, on this computer), runs each answer on the chat service
 * with the chat's tools and the Settings › Assistant model call limit, and writes the Build chat's
 * proposals as changes to review. Screens only show what it says and pass on what the person does.
 */
export interface AssistantHost {
  /** The kept chats, most recently used first. Drafts aren't in it. */
  chats(): Promise<readonly ChatSummary[]>;
  /** One chat. Rejects with `not_found` when it isn't kept (any more) and isn't a draft. */
  chat(chatId: string): Promise<Chat>;
  /**
   * A new chat of `kind`, as a draft, on the model a new chat starts on (flow 5.2), about `about`
   * when it is a Build chat on an item's page. It reuses an empty draft of the same kind about the
   * same item ({@link sameAbout}) instead of making a second one.
   */
  newChat(kind: ChatKind, about?: ChatAbout): Promise<Chat>;
  /**
   * Answers in the chat: adds the message, runs the answer and keeps the chat. A model or tool
   * that fails ends the answer as `failed` instead of rejecting, so the messages before it are
   * kept. Rejects with the shell's `WorkspaceUntrusted` (`denied`) when the chat's model comes
   * from the workspace and the workspace isn't trusted (nothing was sent, flow-assistant 5.9),
   * with `not_found` for a chat that is gone, and with `conflict` while the chat is already
   * answering.
   */
  answer(request: AssistantAnswerRequest): Promise<AssistantAnswer>;
  /**
   * Whether the workspace's engine answers now. While it doesn't, an open chat says so at the top
   * and Send waits (states H12, D5); {@link onDidChange} tells when it changes.
   */
  engineAnswering(): boolean;
  /**
   * Whether the chat answers with the authoring tools only: the workspace isn't trusted and the
   * chat is a Build chat on the person's own Settings › Assistant model (states H17, flow-assistant
   * 5.9). It can read and propose, but not run anything.
   */
  authoringOnly(chatId: string): Promise<boolean>;
  /** The workspace's name, for the toast "Not started: Acme isn't trusted yet" (states H16). */
  workspaceName(): string;
  /**
   * Opens the window's trust check after {@link answer} refused a workspace that isn't trusted,
   * and says how the person answered. Absent where there is no check to open.
   */
  readonly askTrust?: (() => Promise<"trusted" | "declined">) | undefined;
  /** Saves the title trimmed. Rejects with `invalid_input` for an empty title, and with `not_found`. */
  rename(chatId: string, title: string): Promise<void>;
  /** Removes the chat from the kept chats. Its changes to review stay in the items (flow 5.6). */
  deleteChat(chatId: string): Promise<void>;
  /**
   * A Build chat's docs sites, each with the `read_docs` call whose card asked, and its docs log,
   * each line with its call (`assistant.build.site-card`). Empty for a chat that read no docs.
   * A change comes as `{ kind: "chat" }`.
   */
  chatDocs(chatId: string): Promise<SavedChatDocs>;
  /**
   * The person's answer on the site card under the `read_docs` call `cardId`: `allowed` lets the
   * chat read pages from that site for the rest of the chat, `declined` doesn't. Rejects with
   * `not_found` for a card the chat doesn't have, and `conflict` once it was answered.
   */
  answerSite(chatId: string, cardId: string, answer: "allowed" | "declined"): Promise<void>;
  /** Changes the model of this chat only (`assistant.chat.model-per-chat`). Rejects with `not_found`. */
  setModel(chatId: string, model: ChatModel): Promise<void>;
  /** A Build chat's Model menu, in order: the Assistant model first when one is set, then the aliases by name. */
  models(): Promise<readonly ModelOption[]>;
  /** The workspace's agents for the Chat with menu, by name. An agent chat has no authoring tools. */
  agents(): Promise<readonly ChatAgent[]>;
  /** The files with changes to review from the chat, or from every chat without one. */
  itemsToReview(chatId?: string): Promise<readonly ItemToReview[]>;
  /** The changes to review a proposal card wrote, one entry per file. */
  changesForCard(card: ReviewCard): Promise<readonly FileReview[]>;
  /** The changes to review in one file, or `null` when it has none. */
  changesIn(path: string): Promise<FileReview | null>;
  /**
   * The file's saved text, changes to review included; `null` when there is no such file. A card
   * whose last changes were decided elsewhere reads it to tell an Accept from a Reject.
   */
  savedText(path: string): Promise<string | null>;
  /** Accepts the target's changes as one step. Accepting makes nothing live. */
  accept(target: ReviewTarget): Promise<ReviewOutcome>;
  /** Rejects the target's changes as one step: the files go back to their baseline. */
  reject(target: ReviewTarget): Promise<ReviewOutcome>;
  /** Takes back an Accept or Reject, for the toast's **Undo**: files and records go back to `before`. */
  undo(step: ReviewStep): Promise<ReviewOutcome>;
  /**
   * The path of the workspace's own `halonic-authoring` skill, which the Build chat follows instead
   * of the built-in one; `null` when it has none (`assistant.build.authoring-skill-override`).
   */
  authoringSkill(): Promise<string | null>;
  /**
   * Writes the built-in skill to `library/skills/halonic-authoring/SKILL.md` as an ordinary
   * change, the person's own, not one to review, and gives its path. A file already there is kept
   * as it is, whatever it holds.
   */
  customizeSkill(): Promise<string>;
  /** Calls `listener` after each change. Returns the function that stops it. */
  onDidChange(listener: (change: AssistantChange) => void): () => void;
}

/** The open workspace's Assistant, provided by the app (`assistant.host`). */
export const AssistantHostService: ServiceKey<AssistantHost> =
  serviceKey<AssistantHost>("assistant.host");

/**
 * **Show in chat** for the agents and workflows features (`assistant.chat.show-in-chat`): their
 * rows' and pages' ⋮ offer it when the service is there.
 */
export interface ShowInChat {
  /** The ⋮ entry's words. */
  readonly label: string;
  /**
   * Puts the item in the Build chat the panel shows, else in a new Build chat, once. A closed
   * panel opens on that chat, and focus stays where it was.
   */
  show(shown: ShownItem, context: WorkspaceContext): Promise<void>;
}

/** Show in chat, provided by the Assistant feature while the app gives it a host. */
export const ShowInChatService: ServiceKey<ShowInChat> =
  serviceKey<ShowInChat>("assistant.show-in-chat");

/**
 * The Build chat on an item's page, for the workflows and library features (flow 2.4): they use
 * the Assistant only through this service, never by a deep import.
 */
export interface ItemChat {
  /**
   * The chat on the left of the page of `about`, whose name is `name`: the chats about this item
   * only, a new one about it, and the item shown in the page's own panel.
   */
  chatFor(about: ChatAbout, name: string, context: WorkspaceContext): ItemPageChat;
  /**
   * Opens a new Build chat about `about` in the side panel, for a page's "Ask about this <kind>…".
   * Focus moves to the chat's box, which holds `text`, unsent, when it is given.
   */
  askAbout(about: ChatAbout, name: string, context: WorkspaceContext, text?: string): Promise<void>;
  /**
   * Opens a new Build chat about no item in the side panel, for the New workflow dialog's Describe
   * link (flow-workflows 2.2): it reuses an empty Build draft about no item, puts `text` in the box
   * unsent, and moves focus to the end of the text.
   */
  describe(text: string, context: WorkspaceContext): Promise<void>;
}

/** The chat on an item's page, provided by the Assistant feature while the app gives it a host. */
export const ItemChatService: ServiceKey<ItemChat> = serviceKey<ItemChat>("assistant.item-chat");

/**
 * The AI chats for the Home feature's list column (`assistant.home.chats`): Build chats only, since
 * an agent's chat shows only in Messenger. Home uses the Assistant only through this service.
 */
export interface AiChats {
  /** The Build chats with a message, the newest message first. A draft isn't listed. */
  list(context: WorkspaceContext): Promise<readonly ChatSummary[]>;
  /** Calls `listener` after each change to the chats. Returns the function that stops it. */
  subscribe(context: WorkspaceContext, listener: () => void): () => void;
  /** Starts a new Build chat, or takes the empty draft there is, and resolves to its id. */
  newChat(context: WorkspaceContext): Promise<string>;
  /** Takes the chat out of the side panel, so one chat shows in one place at a time. */
  open(chatId: string, context: WorkspaceContext): void;
  /** Draws the chat `chatId` as its tab does, for Home's content pane. */
  render(chatId: string, context: WorkspaceContext): ReactNode;
}

/** Home's AI chats, provided by the Assistant feature while the app gives it a host. */
export const AiChatsService: ServiceKey<AiChats> = serviceKey<AiChats>("assistant.ai-chats");
