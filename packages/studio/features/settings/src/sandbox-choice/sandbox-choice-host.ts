import type { SandboxChoice } from "@halonicjs/app";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * What the sandbox onboarding and Settings › Sandbox need from where Halonic runs: the engine's
 * typed {@link SandboxChoice}. The window only renders what comes back; it never decides which
 * backend runs (`settings.sandbox-choice-view`).
 *
 * The host implements it over `SandboxChoiceService` and the saved sandbox setting. Neither method
 * throws for a backend that can't run: that is a state in the choice, not an error. Saving the
 * setting is not part of this port yet; the host adds it later as its own call.
 */
export interface SandboxChoiceHost {
  /** The latest choice. The first ask runs the trust check. */
  choice(): Promise<SandboxChoice>;
  /** The choice again, after the sandbox setting was saved or removed. */
  settingsChanged(): Promise<SandboxChoice>;
}

/** The window's sandbox choice host, when the app has one. */
export const SandboxChoiceHostService: ServiceKey<SandboxChoiceHost> =
  serviceKey<SandboxChoiceHost>("settings.sandbox-choice-host");
