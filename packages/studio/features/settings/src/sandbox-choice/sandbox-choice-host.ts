import type { SandboxBackendId, SandboxChoice } from "@halonicjs/app";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * What the sandbox onboarding and Settings › Sandbox need from where Halonic runs: the engine's
 * typed {@link SandboxChoice}. The window only renders what comes back; it never decides which
 * backend runs (`settings.sandbox-choice-view`).
 *
 * The host implements it over `SandboxChoiceService` and the saved sandbox setting. No method
 * throws for a backend that can't run: that is a state in the choice, not an error. Asking the
 * person to confirm `"none"` is the window's job, before it calls {@link SandboxChoiceHost.save}.
 */
export interface SandboxChoiceHost {
  /** The latest choice. The first ask runs the trust check. */
  choice(): Promise<SandboxChoice>;
  /** The choice again, after the sandbox setting was saved or removed. */
  settingsChanged(): Promise<SandboxChoice>;
  /**
   * Saves `backend` as the person's sandbox choice, or removes the choice for `null`, and answers
   * the choice after it. Rejects when the host refuses the backend or can't save it; the choice
   * saved before then stays.
   */
  save(backend: SandboxBackendId | "none" | null): Promise<SandboxChoice>;
}

/** The window's sandbox choice host, when the app has one. */
export const SandboxChoiceHostService: ServiceKey<SandboxChoiceHost> =
  serviceKey<SandboxChoiceHost>("settings.sandbox-choice-host");
