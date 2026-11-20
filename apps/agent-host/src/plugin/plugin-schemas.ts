import { s } from "@halonicjs/schema-kit";

/**
 * What a plugin id may be: its folder's name in the profile's plugins
 * folder, as an allow-list, so a name the file system would treat specially
 * (a path, `.`, `..`, a drive, a stream, a control character) never reaches
 * the disk. Windows reads a trailing dot as no dot and a device name (`con`,
 * `nul`, `aux`, `com1`, `lpt1`, with or without an extension) as a device,
 * so those are refused too.
 */
export const pluginIdPattern =
  /^(?!(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$))[a-z0-9](?:[a-z0-9._-]*[a-z0-9_-])?$/u;

const pluginId = s.string().min(1).max(128).regex(pluginIdPattern);

/** What Studio gives to call one tool of a plugin's backend: the plugin by id, never by path. */
export const callPluginBody = s
  .object({
    plugin: pluginId,
    tool: s.string().min(1),
    args: s.record(s.string(), s.unknown()),
  })
  .strict();

/** The most secrets one hand-over may hold. */
export const maxHandedSecrets = 32;

/** The longest secret value the host takes, as the shell's keychain commands allow. */
export const maxSecretValueLength = 16_384;

/**
 * What Studio hands the host for one plugin: each secret by the name the
 * plugin declares, never the name it is kept under, which the host builds.
 */
export const handOverSecretsBody = s
  .object({
    plugin: pluginId,
    secrets: s
      .record(s.string().min(1).max(64), s.string().min(1).max(maxSecretValueLength))
      .refine((secrets) => Object.keys(secrets).length <= maxHandedSecrets),
  })
  .strict();
