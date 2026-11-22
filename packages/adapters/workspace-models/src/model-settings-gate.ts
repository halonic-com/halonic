import type { ChatAgentSettings } from "@halonicjs/ports";
import { definitionsOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { providerAddress } from "./workspace-providers.ts";

/**
 * The check a chat turn's unsaved model settings pass. It has the shape of
 * `host-server`'s `ModelSettingsGate` without importing it, so this adapter
 * doesn't depend on the host.
 */
export interface WorkspaceModelSettings {
  /** Whether `settings` may be used in a turn for `hubId`. */
  allows(hubId: string, settings: ChatAgentSettings): Promise<boolean>;
}

/** The address a provider of this type calls, without a trailing slash, or `undefined` for the adapter's built-in one. */
function addressOf(type: string, baseUrl: string | undefined): string | undefined {
  return providerAddress(type, baseUrl)?.replace(/\/+$/, "");
}

/**
 * The host's check on a chat turn's unsaved model settings, for `serve` and
 * the engine role alike, so the two can't drift apart. The host sends
 * the secret a setting names to the setting's address, so it accepts a secret
 * only with a provider file of the workspace that names that secret, has the
 * same type and calls that same address. A settings object without a secret
 * sends no key and passes. A hub the workspace doesn't have is refused.
 *
 * @param workspace reads the live version on each call, so a committed provider change applies
 *   before any run starts from it; a chat turn has no run version of its own to keep. It gives
 *   `null` for a version that fails the trust check a run's version passes, so a provider address
 *   nobody trusted here gets no key, and every secret is refused until someone trusts it.
 */
export function workspaceModelSettings(
  workspace: () => Promise<LoadedWorkspace | null>,
): WorkspaceModelSettings {
  return {
    allows: async (hubId, settings) => {
      if (settings.secret === undefined) return true;
      // Outside the `try`: a version that can't be read is a failure, not a refusal.
      const served = await workspace();
      if (served === null) return false;
      let providers: ReturnType<typeof definitionsOf>["providers"];
      try {
        providers = definitionsOf(served, hubId).providers;
      } catch {
        return false;
      }
      const asked = addressOf(settings.type, settings.baseUrl);
      return Object.values(providers).some(
        (file) =>
          file.secret === settings.secret &&
          file.type === settings.type &&
          addressOf(file.type, file.baseUrl) === asked,
      );
    },
  };
}
