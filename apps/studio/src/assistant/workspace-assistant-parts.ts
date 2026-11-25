import type { ChatAnswer, ChatAnswerRequest, HostSettings, ReviewService } from "@halonicjs/app";
import type { DefinitionStore, Digest } from "@halonicjs/ports";
import type { DocsReading } from "./chat-docs.ts";
import type { HasKey } from "./chat-models.ts";
import type { ChatStore } from "./kept-chats.ts";

/** What `WorkspaceAssistant` works on. */
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
  /**
   * What a trusted Build chat's `read_docs` fetches with (`studio.assistant-read-docs`). Absent
   * where there is no shell: the chat has no `read_docs`.
   */
  readonly docs?: DocsReading | undefined;
}

/** The window's engine connection, as `WorkspaceAssistant` follows it. */
export interface WorkspaceAssistantEngine {
  readonly answering: () => boolean;
  readonly onChange: (listener: (answering: boolean) => void) => () => void;
}
