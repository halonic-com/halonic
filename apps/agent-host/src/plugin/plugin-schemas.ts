import { s } from "@halonicjs/schema-kit";

/**
 * What a plugin id may be: its folder's name in the profile's plugins
 * folder, as an allow-list, so a name the file system would treat specially
 * (a path, `.`, `..`, a drive, a stream, a control character) never reaches
 * the disk.
 */
export const pluginIdPattern = /^[a-z0-9][a-z0-9._-]*$/u;

const pluginId = s.string().min(1).max(128).regex(pluginIdPattern);

/** What Studio gives to call one tool of a plugin's backend: the plugin by id, never by path. */
export const callPluginBody = s
  .object({
    plugin: pluginId,
    tool: s.string().min(1),
    args: s.record(s.string(), s.unknown()),
  })
  .strict();
