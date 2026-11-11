/**
 * The shell's host settings commands. The shell keeps the settings in
 * `settings/host.json` in the profile, as `FileHostSettingsStore` in
 * `fs-node` keeps them, so the CLI and the desktop app read and write the
 * same file. No command takes a path.
 */
export const hostSettingsCommands = {
  /** `{}` → every saved value by key; `{}` when none is saved or the file can't be parsed. */
  read: "host_settings_read",
  /** `{ key, value }` → nothing. Saves one key and keeps every other key as it is. */
  set: "host_settings_set",
  /** `{ key }` → nothing; also when the key isn't saved. */
  remove: "host_settings_remove",
} as const;

/** Why the shell refused a host settings call: the `kind` of its error. */
export const hostSettingsRefusalKinds = [
  /** The key isn't one `isHostSettingKey` allows; nothing was saved. */
  "invalid_key",
  /** The settings would be over `hostSettingsMaxBytes`; nothing was saved. */
  "too_large",
  /** `host.json` is a link, a hard link or not a plain file, or the system refused to read it. */
  "unreadable",
  /** Finding the profile or writing the file failed. */
  "io",
] as const;

/** One of {@link hostSettingsRefusalKinds}. */
export type HostSettingsRefusalKind = (typeof hostSettingsRefusalKinds)[number];

/** What a refused command rejects with. */
export interface HostSettingsRefusal {
  readonly kind: HostSettingsRefusalKind;
  readonly message: string;
}

/** Whether a rejection is the shell's refusal shape, as opposed to an IPC or permission failure. */
export function isHostSettingsRefusal(reason: unknown): reason is HostSettingsRefusal {
  if (typeof reason !== "object" || reason === null) {
    return false;
  }
  const { kind, message } = reason as Record<string, unknown>;
  return hostSettingsRefusalKinds.some((known) => known === kind) && typeof message === "string";
}
