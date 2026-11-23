import { readTaskEffortSettings, type SecretRef, secretRef } from "../task-effort/settings.ts";

/**
 * The difficulty tagger's settings, as the board saves them in the plugin's
 * settings. Only the board can change those, so the switch is board-only.
 */

/** The tagger's part of a company's settings. */
export interface TaggerSettings {
  /**
   * The plugin version the board allowed to tag, or undefined. Tagging is on
   * only while this equals the running version, so every install and upgrade
   * starts with it off, like the task effort switch.
   */
  readonly writesForVersion: string | undefined;
  /** The secret with the tagger's Anthropic API key (TAGGER_ANTHROPIC_API_KEY). */
  readonly anthropicKey: SecretRef | undefined;
  /** Paperclip's API, shared with the task effort handler: the tagger reads the company's labels there. */
  readonly apiUrl: string | undefined;
  /** The secret with the key for Paperclip's API, shared with the task effort handler. */
  readonly apiKey: SecretRef | undefined;
}

/** Reads the tagger's settings; anything odd counts as unset. */
export function readTaggerSettings(config: Readonly<Record<string, unknown>>): TaggerSettings {
  const version = config["difficultyTaggerForVersion"];
  const shared = readTaskEffortSettings(config);
  return {
    writesForVersion:
      typeof version === "string" && version.trim() !== "" ? version.trim() : undefined,
    anthropicKey: secretRef(config["taggerAnthropicKey"]),
    apiUrl: shared.apiUrl,
    apiKey: shared.apiKey,
  };
}

/** The settings of a tagger the board turned on: every one it needs is set. */
export interface ActiveTaggerSettings {
  readonly anthropicKey: SecretRef;
  readonly apiUrl: string;
  readonly apiKey: SecretRef;
}

/**
 * The settings to tag with when the board turned the tagger on for exactly
 * this version and every setting it needs is set; otherwise undefined.
 */
export function taggerOn(
  settings: TaggerSettings,
  version: string,
): ActiveTaggerSettings | undefined {
  const { writesForVersion, anthropicKey, apiUrl, apiKey } = settings;
  if (writesForVersion !== version || anthropicKey === undefined) {
    return undefined;
  }
  return apiUrl === undefined || apiKey === undefined
    ? undefined
    : { anthropicKey, apiUrl, apiKey };
}
