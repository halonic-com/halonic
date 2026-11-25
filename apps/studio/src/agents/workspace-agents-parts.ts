import type { ChatAnswer, ChatAnswerRequest } from "@halonicjs/app";
import type {
  AgentHarnessId,
  AgentLiveState,
  AgentRef,
  HarnessReadiness,
  HarnessSignIn,
  SavedChatsPlace,
} from "@halonicjs/studio-feature-agents/api";
import type { HasKey } from "../assistant/chat-models.ts";
import type { WatchItemTryItChanges } from "../changes/try-it-changes.ts";
import type { AgentPlacementChoices } from "./agent-placement-choices.ts";
import type { NewAgentsParts } from "./new-agent-placing.ts";

/** What `WorkspaceAgents` needs of the workspace's files. */
export interface WorkspaceAgentsParts {
  /** The kernel's `WorkspaceFiles`: reads with unsaved changes applied, and changes as one undo step. */
  readonly files: {
    read(path: string): Promise<string | null>;
    list(dir: string): Promise<string[]>;
    change(
      label: string,
      changes: Record<string, string | null>,
      options?: { coalesceKey?: string },
    ): void;
    /** The kernel's `WorkspaceFiles.undo`: `false` when there was nothing to undo. */
    undo(): boolean;
    /** The kernel's `WorkspaceFiles.step`: moves on every change, so it tells a step is still the newest. */
    readonly step: number;
    /** The kernel's `WorkspaceFiles.pending`: the unsaved changes by path. */
    readonly pending: Readonly<Record<string, string | null>>;
  };
  /** Calls `listener` after every change of the workspace's files; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
  /**
   * Asks the agent host whether a harness can run for this agent; rejects when the host can't be
   * asked. Absent where there is no agent host (the browser), which answers "couldn't check".
   */
  readonly detectHarness?: (ref: AgentRef, harness: AgentHarnessId) => Promise<HarnessReadiness>;
  /**
   * What Settings › New agents run needs to place each new agent. Absent where there is no agent
   * host (the browser), so a new agent stays in its sandbox.
   */
  readonly newAgents?: NewAgentsParts;
  /**
   * Asks the agent host to open a harness's own sign-in for this agent, in its own settings
   * folder. Absent where there is no agent host (the browser), which refuses with the reason.
   */
  readonly openSignIn?: (ref: AgentRef, harness: AgentHarnessId) => Promise<HarnessSignIn>;
  /**
   * The live state of a workspace file (core's `liveState`), by its path from the workspace
   * folder. Without it an agent counts as live, as a routine does, so the page shows no line.
   */
  readonly liveness?: (path: string) => Promise<AgentLiveState>;
  /**
   * Answers a chat on the workspace's engine: `ChatService.answer` on the engine's executor,
   * which opens the engine on first use. Absent where there is no engine, which answers
   * "The engine isn't answering."
   */
  readonly answerChat?: (request: ChatAnswerRequest) => Promise<ChatAnswer>;
  /**
   * Opens Create version with only `paths` in it (source control's `VersionDialogService`), and
   * answers once a version is made or the dialog is closed. With `name`, the dialog says it makes
   * that item live. Absent where the app can't offer that, so there is no `makeLive`.
   */
  readonly versionDialog?: (
    paths: readonly string[],
    options?: { readonly name?: string },
  ) => Promise<"made" | "cancelled">;
  /**
   * Where each agent runs on this computer, kept by the agent host. Absent where there is no agent
   * host (the browser): the Harness page then offers no choice.
   */
  readonly placement?: AgentPlacementChoices;
  /**
   * The workspace's trust, for a Try it message: whether it may start now, the window's trust
   * check, and the workspace's name for the toast. Absent where there is no folder to trust.
   */
  readonly trust?: {
    readonly mayStart: () => boolean;
    readonly askTrust: () => Promise<"trusted" | "declined">;
    readonly workspaceName: string;
  };
  /**
   * Watches an item's changes to review for the Try it line (`studio.try-it-changes`). Absent
   * where the workspace has no review service, so no line shows.
   */
  readonly tryItChanges?: WatchItemTryItChanges;
  /** Where the workspace's chats are saved, so Try it chats are kept with the Build chats. */
  readonly savedChats?: SavedChatsPlace;
  /**
   * Whether a key is stored under a secret name, never the key, for the Try it line of a model
   * without its key (H19). Absent where keys can't be asked, which shows no line.
   */
  readonly hasKey?: HasKey;
}
