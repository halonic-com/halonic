/**
 * The services and types other features may use. Features import each
 * other only through this file.
 */
import type { HostSettings } from "@halonicjs/app";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { SandboxCheckFacts, SandboxOutcome } from "./agent-sandbox/sandbox-state.ts";
import type { AssistantProvider } from "./assistant/assistant-providers.ts";
import type { DisplaySettings } from "./display-settings.ts";
import type { RestartRunsHost } from "./updater/restart-runs.ts";
import type { UpdaterHost } from "./updater/updater-host.ts";

/**
 * The settings kept where Halonic runs, for every workspace on that computer: the Assistant's and
 * the sandbox default. The app makes one `HostSettings` over the profile's store, loads it, and
 * gives it to every workspace (`settings.ai-agent-prefs`).
 */
export const HostSettingsService: ServiceKey<HostSettings> =
  serviceKey<HostSettings>("settings.host");

export type { DisplayPref } from "./display-prefs.ts";
export type { DisplaySettings, SaveOutcome } from "./display-settings.ts";

/**
 * The window's display settings: Appearance, Formats and Developer. The app makes one
 * `DisplaySettings` per window and gives that same one to every workspace, so a change in Settings
 * reaches the whole window at once.
 */
export const DisplaySettingsService: ServiceKey<DisplaySettings> =
  serviceKey<DisplaySettings>("settings.display");

export type { SandboxCheckFacts, SandboxOutcome } from "./agent-sandbox/sandbox-state.ts";

/**
 * What Settings › Agent sandbox needs of the agent host. The app gives it where a host runs (the
 * desktop app); without it the section reads Not available. Nothing here starts by itself: the
 * section calls `setUp` and `remove` only when the person presses the button (`settings.agent-sandbox-section`).
 */
export interface AgentSandboxHost {
  /** False on a build without the sandbox (D44 c). */
  readonly available: boolean;
  /** The host's check, in the section's words. `checkedAt` is an ISO time. */
  check(): Promise<SandboxCheckFacts>;
  /** Which command runs in the host now, if any: a setup or removal that began before Settings opened. */
  running(): Promise<"setup" | "remove" | null>;
  /**
   * Runs the one-time setup, or the repair, until the host says how it ended: `null` when it
   * worked (the caller then checks), else why it didn't. Joins a setup that already runs. The
   * command itself isn't stopped when `signal` aborts: the host stops following it.
   */
  setUp(options?: { readonly signal?: AbortSignal }): Promise<SandboxOutcome | null>;
  /** Runs the removal until it ends, with the same answer as `setUp`. */
  remove(options?: { readonly signal?: AbortSignal }): Promise<SandboxOutcome | null>;
  /**
   * Follows a command that already runs, as `running()` said, until it ends, with the same
   * answer as `setUp`, or `undefined` when `signal` aborts first. Reads only: it never starts
   * a command, so opening Settings can't (`settings.agent-sandbox-state`).
   */
  follow(
    verb: "setup" | "remove",
    options?: { readonly signal?: AbortSignal },
  ): Promise<SandboxOutcome | null | undefined>;
}

/** The agent sandbox the host runs, when the app has one. */
export const AgentSandboxService: ServiceKey<AgentSandboxHost> =
  serviceKey<AgentSandboxHost>("settings.agent-sandbox");

/** What Settings › Assistant needs to know of the workspace open in the window. */
export interface AssistantWorkspaceFacts {
  /** The workspace's name, as its heading says it. */
  readonly name: string;
  /** True while the workspace has `privacy.localOnly` on. */
  readonly localOnly: boolean;
  /** The model alias the workspace sets for its own assistant chats, or `null` when it sets none. */
  readonly sessionModel: string | null;
  /** Whether a provider of this workspace uses the secret name. */
  usesSecret(secretName: string): boolean;
}

/**
 * The open workspace, for the Assistant's key line, its local-only warning and its "sets its own"
 * line. The app gives it where a window has workspaces. Reads and links only: Settings never saves
 * a key or changes a workspace (HAL-119: keys are entered on the provider page).
 */
export interface AssistantWorkspace {
  /** The open workspace, or `null` with none open. The same object until something in it changes. */
  current(): AssistantWorkspaceFacts | null;
  /** Calls `listener` when `current()` changes. Returns the function that stops it. */
  subscribe(listener: () => void): () => void;
  /** Whether a key is stored under the secret name, as the workspace's secret store knows it. */
  keyStored(secretName: string): Promise<boolean>;
}

/**
 * Where the Assistant's links lead. Each runs after Settings has closed. The window gives them to
 * Settings, so the app's workspace service stays free of the window.
 */
export interface AssistantNavigation {
  /**
   * Opens the page of the provider that uses the secret name, at its key block. Without it the key
   * line shows no link: leave it out until the workspace has provider pages.
   */
  openProviderPage?(secretName: string): void;
  /**
   * Starts Add provider on the workspace page with the type and the secret name filled in. Left
   * out for the same reason as `openProviderPage`.
   */
  addProvider?(provider: Exclude<AssistantProvider, "not-set-up">, secretName: string): void;
  /** Opens the workspace page at Session AI. */
  openSessionAi(): void;
}

/** The open workspace, when the window has one to tell the Assistant about. */
export const AssistantWorkspaceService: ServiceKey<AssistantWorkspace> =
  serviceKey<AssistantWorkspace>("settings.assistant-workspace");

export type { UpdaterHost } from "./updater/updater-host.ts";
export type {
  CheckFailure,
  DownloadFailure,
  JustUpdated,
  ManagedUpdates,
  UpdateState,
  UpdateStatus,
} from "./updater/updater-status.ts";

/** The updater the desktop app runs. Without it, About Halonic shows only the view-only line. */
export const UpdaterService: ServiceKey<UpdaterHost> = serviceKey<UpdaterHost>("settings.updater");

export type { RestartRuns, RestartRunsHost } from "./updater/restart-runs.ts";

/**
 * Which runs a restart would end, so the restart dialog can name them. The app provides it where
 * Halonic runs as the desktop app; Restart to update asks it before it stops anything.
 */
export const RestartRunsService: ServiceKey<RestartRunsHost> =
  serviceKey<RestartRunsHost>("settings.restart-runs");
