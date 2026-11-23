import { readTaskEffortSettings, type SecretRef, secretRef } from "../task-effort/settings.ts";

/**
 * The difficulty tagger's settings, as the board saves them in the plugin's
 * settings. It reads company labels through Paperclip's API with the task
 * effort handler's address and key, so those come from that handler's settings.
 */

/** The tagger's part of a company's settings. */
export interface DifficultyTaggerSettings {
  /**
   * The plugin version the board allowed to write labels, or undefined.
   * Labels are written only while this equals the running version.
   */
  readonly writesForVersion: string | undefined;
  /** The secret with the Anthropic API key, or undefined: then the tagger doesn't run. */
  readonly anthropicKey: SecretRef | undefined;
  /** The model the tagger asks. */
  readonly model: string;
  /** Paperclip's API, where the company's label ids come from. */
  readonly apiUrl: string | undefined;
  /** The secret with the key for Paperclip's API. */
  readonly apiKey: SecretRef | undefined;
}

/** The model the board ran the backfill with (HAL-16876, 23 Nov). */
export const defaultTaggerModel = "claude-haiku-5-5";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Only a Claude model id, so the setting can't carry anything else into the request. */
function model(value: unknown): string {
  const id = text(value);
  return id !== undefined && /^claude-[\w.-]+$/.test(id) ? id : defaultTaggerModel;
}

/** Reads the tagger's settings; anything odd counts as unset. */
export function readTaggerSettings(
  config: Readonly<Record<string, unknown>>,
): DifficultyTaggerSettings {
  const effort = readTaskEffortSettings(config);
  return {
    writesForVersion: text(config["difficultyTaggerWritesForVersion"]),
    anthropicKey: secretRef(config["anthropicApiKey"]),
    model: model(config["difficultyTaggerModel"]),
    apiUrl: effort.apiUrl,
    apiKey: effort.apiKey,
  };
}

/** Whether the board turned label writes on for exactly this version of the plugin. */
export function taggerWritesOn(settings: DifficultyTaggerSettings, version: string): boolean {
  return (
    settings.writesForVersion === version &&
    settings.apiUrl !== undefined &&
    settings.apiKey !== undefined
  );
}
