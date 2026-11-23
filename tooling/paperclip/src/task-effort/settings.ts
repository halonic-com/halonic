/**
 * The task effort handler's settings, as the board saves them in the plugin's
 * settings. Only the board can change a plugin's settings, so the switch that
 * lets the handler write is board-only.
 */

/** A secret the board bound in the settings. */
export interface SecretRef {
  readonly type: "secret_ref";
  readonly secretId: string;
}

/** The handler's part of a company's settings. */
export interface TaskEffortSettings {
  /**
   * The plugin version the board allowed to write task efforts, or undefined.
   * Writes are on only while this equals the running version, so every
   * install and upgrade starts with them off until the board enters the new one.
   */
  readonly writesForVersion: string | undefined;
  /** Paperclip's own API, which takes the task change the plugin SDK can't send. */
  readonly apiUrl: string | undefined;
  /** The secret with the API key the handler sends its task changes with. */
  readonly apiKey: SecretRef | undefined;
  /** Url keys of the reviewers whose hand-back without an approval counts as a send-back. */
  readonly reviewers: readonly string[];
}

/** Liam and Julian review pull requests on `halonic` (HAL-14809). */
const defaultReviewers = ["liam", "julian"];

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Only a scheme, a host and a port, so a setting can't point the key at another path. */
function apiUrl(value: unknown): string | undefined {
  const url = text(value);
  return url !== undefined && /^https?:\/\/[\w.-]+(:\d+)?$/.test(url) ? url : undefined;
}

/** A secret binding from the settings, or undefined when the value isn't one. */
export function secretRef(value: unknown): SecretRef | undefined {
  const ref = value as { type?: unknown; secretId?: unknown } | undefined;
  return ref?.type === "secret_ref" && typeof ref.secretId === "string"
    ? { type: "secret_ref", secretId: ref.secretId }
    : undefined;
}

function reviewers(value: unknown): readonly string[] {
  const keys = (Array.isArray(value) ? value : []).filter(
    (key): key is string => typeof key === "string" && /^[\w-]+$/.test(key),
  );
  return keys.length > 0 ? keys : defaultReviewers;
}

/** Reads the handler's settings; anything odd counts as unset. */
export function readTaskEffortSettings(
  config: Readonly<Record<string, unknown>>,
): TaskEffortSettings {
  return {
    writesForVersion: text(config["taskEffortWritesForVersion"]),
    apiUrl: apiUrl(config["paperclipApiUrl"]),
    apiKey: secretRef(config["paperclipApiKey"]),
    reviewers: reviewers(config["effortReviewers"]),
  };
}

/** Whether the board turned task effort writes on for exactly this version of the plugin. */
export function taskEffortWritesOn(settings: TaskEffortSettings, version: string): boolean {
  return (
    settings.writesForVersion === version &&
    settings.apiUrl !== undefined &&
    settings.apiKey !== undefined
  );
}
