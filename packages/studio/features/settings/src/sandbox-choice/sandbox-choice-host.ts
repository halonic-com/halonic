import type { SandboxBackendId, SandboxChoice } from "@halonicjs/app";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * What the sandbox onboarding and Settings › Sandbox need from where Halonic runs: the engine's
 * typed {@link SandboxChoice}, and the three things a person can ask for. The window only renders
 * what comes back; it never decides which backend runs (`settings.sandbox-choice-view`).
 *
 * The host implements it over `SandboxChoiceService` and the saved sandbox setting. Every method
 * gives the choice as it stands after the call, and none of them throws for a backend that can't
 * run: that is a state in the choice, not an error.
 */
export interface SandboxChoiceHost {
  /** The latest choice, or `null` before the host has chosen at startup. */
  current(): Promise<SandboxChoice | null>;
  /**
   * Saves the person's pick (`"none"` for continuing without a sandbox), downloads what the backend
   * still needs, and chooses again. Called only when the person presses a button for it.
   */
  choose(backend: SandboxBackendId | "none"): Promise<SandboxChoice>;
  /** Checks again from the saved setting, after the person fixed something. */
  check(): Promise<SandboxChoice>;
}

/** The window's sandbox choice host, when the app has one. */
export const SandboxChoiceHostService: ServiceKey<SandboxChoiceHost> =
  serviceKey<SandboxChoiceHost>("settings.sandbox-choice-host");
