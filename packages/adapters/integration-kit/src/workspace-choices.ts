import { pluginSecrets, type Secrets, workspaceSecrets } from "@halonicjs/ports";

/** What the workspace chose for one integration. */
export interface WorkspaceChoices {
  /** Its settings, such as the URL a `{ fromSetting }` host reads. Never a secret value. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /**
   * For each secret in the sheet, the workspace secret the user picked for
   * it. A secret left out isn't configured: an optional one is left off the
   * request, any other is refused when a request needs it.
   */
  readonly secretNames?: Readonly<Record<string, string>>;
}

/**
 * The settings the workspace chose. The loader and the host's sign-ins
 * (`createIntegrationSignIns`'s `current()`) both read them here, from the
 * same `WorkspaceChoices`, so they never hold two copies.
 *
 * @example
 * choiceSettings({ settings: { url: "http://localhost:11434" } }); // { url: "http://localhost:11434" }
 * choiceSettings(undefined); // {}
 */
export function choiceSettings(
  choices: WorkspaceChoices | undefined,
): Readonly<Record<string, unknown>> {
  return choices?.settings ?? {};
}

/**
 * The raw secrets seen through the user's picks: the kit asks by the sheet's
 * name and reads the secret picked for it, or nothing. A workspace chose
 * those names, so they can't reach Halonic's own secrets, tokens or a
 * plugin's. A plugin's backend's names come from its manifest and can reach
 * only that plugin's own secrets (`plugin`).
 *
 * The host's sign-ins read the client secret through this same view, so the
 * sheet's name is translated to the workspace's in one place.
 *
 * @example
 * const secrets = chosenSecrets(raw, { secretNames: { "client-secret": "gitlab-secret" } });
 * await secrets.get("client-secret"); // the workspace's "gitlab-secret"
 */
export function chosenSecrets(
  raw: Secrets,
  choices: WorkspaceChoices | undefined,
  plugin?: string,
): Secrets {
  const picks = new Map(Object.entries(choices?.secretNames ?? {}));
  const readable = plugin === undefined ? workspaceSecrets(raw) : pluginSecrets(raw, plugin);
  return {
    get: async (name) => {
      const picked = picks.get(name);
      return picked === undefined ? null : await readable.get(picked);
    },
  };
}
