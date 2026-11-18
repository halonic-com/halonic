import {
  choiceSettings,
  chosenSecrets,
  type WorkspaceChoices,
} from "@halonicjs/adapter-integration-kit";
import type { IntegrationSheet } from "@halonicjs/format";
import type { SignInIntegration } from "@halonicjs/host-integration-sign-in";
import type { Secrets } from "@halonicjs/ports";

/** What the app knows about one integration it runs sign-ins for. */
export interface AppSignInIntegration {
  /**
   * The integration's sheet and what the person chose for it, now. The kit
   * loader's `choices` is the `choices` read here, the same value, so the
   * loader and the sign-ins can't hold two copies. Read each time, never kept.
   */
  read(): Promise<{ readonly sheet: IntegrationSheet; readonly choices: WorkspaceChoices }>;
  /** The plugin's id, when the integration is a plugin's backend: its secret picks then reach only that plugin's own secrets. */
  readonly plugin?: string;
}

/**
 * The host's view of an integration for its sign-ins, from the app's one
 * source of its sheet and choices: the settings are the choices' settings,
 * and the client secret is read through the person's secret picks, by the
 * sheet's name, exactly as the kit's loader reads the integration's secrets.
 * Both read the source again each time, so a changed setting or pick counts at
 * once.
 *
 * @param raw - the raw secrets; nothing reads them but through the picks
 *
 * @example
 * const integration = signInIntegration(secrets, { read: async () => ({ sheet, choices }) });
 */
export function signInIntegration(raw: Secrets, app: AppSignInIntegration): SignInIntegration {
  return {
    read: async () => {
      const { sheet, choices } = await app.read();
      return { sheet, settings: choiceSettings(choices) };
    },
    secrets: {
      get: async (name) => {
        const { choices } = await app.read();
        return await chosenSecrets(raw, choices, app.plugin).get(name);
      },
    },
  };
}
