import type { ModelSettingsGate } from "@halonicjs/host-server";
import { definitionsOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { providerAddress } from "../../workspace-providers.ts";

/** The address a provider of this type calls, without a trailing slash, or `undefined` for the adapter's built-in one. */
function addressOf(type: string, baseUrl: string | undefined): string | undefined {
  return providerAddress(type, baseUrl)?.replace(/\/+$/, "");
}

/**
 * The server's check on a chat turn's unsaved model settings. The host sends
 * the secret a setting names to the setting's address, so it accepts a secret
 * only with a provider file of the workspace that names that secret, has the
 * same type and calls that same address. A settings object without a secret
 * sends no key and passes. A hub the workspace doesn't have is refused.
 *
 * @param workspace the workspace served now, read on each call so a new version applies at once
 */
export function workspaceModelSettings(workspace: () => LoadedWorkspace): ModelSettingsGate {
  return {
    allows: async (hubId, settings) => {
      if (settings.secret === undefined) return true;
      let providers: ReturnType<typeof definitionsOf>["providers"];
      try {
        providers = definitionsOf(workspace(), hubId).providers;
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
