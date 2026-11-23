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
import type { ChatMessage } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

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

/** One answer in a chat. */
export interface AssistantAnswerRequest {
  readonly chatId: string;
  /**
   * The person's new message. Absent continues the last answer after it reached the model call
   * limit (flow 3.6), without a new message.
   */
  readonly message?: string | undefined;
  /** Aborted when the person clicks Stop. */
  readonly signal?: AbortSignal | undefined;
  /** Told how the answer goes, for the status line and the transcript. */
  readonly listener?: ChatAnswerListener | undefined;
}

/**
 * What changed, for {@link AssistantHost.onDidChange}: the list of chats (one added, renamed,
 * deleted, or its answering or to-review state), one chat's messages or model, or the changes to
 * review in some files, whoever made them.
 */
export type AssistantChange =
  | { readonly kind: "chats" }
  | { readonly kind: "chat"; readonly chatId: string }
  | { readonly kind: "review"; readonly paths: readonly string[] };

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
   * A new chat of `kind`, as a draft, on the model a new chat starts on (flow 5.2). It reuses an
   * empty draft of the same kind instead of making a second one.
   */
  newChat(kind: ChatKind): Promise<Chat>;
  /**
   * Answers in the chat: adds the message, runs the answer and keeps the chat. A model or tool
   * that fails ends the answer as `failed` instead of rejecting, so the messages before it are
   * kept. Rejects with `denied` when the chat's model comes from the workspace and the workspace
   * isn't trusted (nothing was sent), with `not_found` for a chat that is gone, and with
   * `conflict` while the chat is already answering.
   */
  answer(request: AssistantAnswerRequest): Promise<ChatAnswer>;
  /** Saves the title trimmed. Rejects with `invalid_input` for an empty title, and with `not_found`. */
  rename(chatId: string, title: string): Promise<void>;
  /** Removes the chat from the kept chats. Its changes to review stay in the items (flow 5.6). */
  deleteChat(chatId: string): Promise<void>;
  /** Changes the model of this chat only (`assistant.chat.model-per-chat`). Rejects with `not_found`. */
  setModel(chatId: string, model: ChatModel): Promise<void>;
  /** A Build chat's Model menu, in order: the Assistant model first when one is set, then the aliases by name. */
  models(): Promise<readonly ModelOption[]>;
  /** The files with changes to review from the chat, or from every chat without one. */
  itemsToReview(chatId?: string): Promise<readonly ItemToReview[]>;
  /** The changes to review a proposal card wrote, one entry per file. */
  changesForCard(card: ReviewCard): Promise<readonly FileReview[]>;
  /** The changes to review in one file, or `null` when it has none. */
  changesIn(path: string): Promise<FileReview | null>;
  /** Accepts the target's changes as one step. Accepting makes nothing live. */
  accept(target: ReviewTarget): Promise<ReviewOutcome>;
  /** Rejects the target's changes as one step: the files go back to their baseline. */
  reject(target: ReviewTarget): Promise<ReviewOutcome>;
  /** Takes back an Accept or Reject, for the toast's **Undo**: files and records go back to `before`. */
  undo(step: ReviewStep): Promise<ReviewOutcome>;
  /** Calls `listener` after each change. Returns the function that stops it. */
  onDidChange(listener: (change: AssistantChange) => void): () => void;
}

/** The open workspace's Assistant, provided by the app (`assistant.host`). */
export const AssistantHostService: ServiceKey<AssistantHost> =
  serviceKey<AssistantHost>("assistant.host");
