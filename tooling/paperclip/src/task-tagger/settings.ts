import { readTaskEffortSettings, type SecretRef } from "../task-effort/settings.ts";

/**
 * The difficulty tagger's settings, as the board saves them in the plugin's
 * settings. Like the task effort writes, the tagger is off until the board
 * enters the running version, so every install and upgrade starts with it off.
 */

/** The tagger's part of a company's settings. */
export interface TaskTaggerSettings {
  /** The plugin version the board allowed to tag tasks, or undefined. */
  readonly writesForVersion: string | undefined;
  /** The secret with the Anthropic API key the tagger calls Haiku with (`TAGGER_ANTHROPIC_API_KEY`). */
  readonly anthropicKey: SecretRef | undefined;
  /** Paperclip's API, where the tagger looks up the company's label ids. */
  readonly apiUrl: string | undefined;
  /** The secret with the Paperclip API key for that lookup (shared with the task effort handler). */
  readonly apiKey: SecretRef | undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function secretRef(value: unknown): SecretRef | undefined {
  const ref = value as { type?: unknown; secretId?: unknown } | undefined;
  return ref?.type === "secret_ref" && typeof ref.secretId === "string"
    ? { type: "secret_ref", secretId: ref.secretId }
    : undefined;
}

/** Reads the tagger's settings; anything odd counts as unset. */
export function readTaskTaggerSettings(
  config: Readonly<Record<string, unknown>>,
): TaskTaggerSettings {
  const effort = readTaskEffortSettings(config);
  return {
    writesForVersion: text(config["taskTaggerWritesForVersion"]),
    anthropicKey: secretRef(config["taggerAnthropicKey"]),
    apiUrl: effort.apiUrl,
    apiKey: effort.apiKey,
  };
}

/** The settings of a tagger that is on: everything it needs is set. */
export interface ReadyTaggerSettings {
  readonly anthropicKey: SecretRef;
  readonly apiUrl: string;
  readonly apiKey: SecretRef;
}

/**
 * The settings when the board turned the tagger on for exactly this version
 * and everything it needs is set, otherwise undefined: the tagger is off.
 */
export function readyTagger(
  settings: TaskTaggerSettings,
  version: string,
): ReadyTaggerSettings | undefined {
  const { writesForVersion, anthropicKey, apiUrl, apiKey } = settings;
  if (writesForVersion !== version || anthropicKey === undefined) {
    return undefined;
  }
  return apiUrl === undefined || apiKey === undefined
    ? undefined
    : { anthropicKey, apiUrl, apiKey };
}
