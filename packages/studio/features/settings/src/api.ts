/**
 * The services and types other features may use. Features import each
 * other only through this file.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { SandboxCheckFacts, SandboxOutcome } from "./agent-sandbox/sandbox-state.ts";
import type { DisplaySettings } from "./display-settings.ts";

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
  /**
   * Runs the one-time setup, or the repair, until the host says how it ended: `null` when it
   * worked (the caller then checks), else why it didn't. Joins a setup that already runs.
   */
  setUp(): Promise<SandboxOutcome | null>;
  /** Runs the removal until it ends, with the same answer as `setUp`. */
  remove(): Promise<SandboxOutcome | null>;
}

/** The agent sandbox the host runs, when the app has one. */
export const AgentSandboxService: ServiceKey<AgentSandboxHost> =
  serviceKey<AgentSandboxHost>("settings.agent-sandbox");
