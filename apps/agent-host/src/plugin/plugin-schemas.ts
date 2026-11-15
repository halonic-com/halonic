import { s } from "@halonicjs/schema-kit";

/**
 * A plugin id is its folder's name in the profile's plugins folder, so it is
 * one name: never empty, `.` or `..`, and never a path.
 */
const pluginId = s
  .string()
  .min(1)
  .max(128)
  .regex(/^(?!\.{1,2}$)[^/\\\0]+$/u);

/** What Studio gives to call one tool of a plugin's backend: the plugin by id, never by path. */
export const callPluginBody = s
  .object({
    plugin: pluginId,
    tool: s.string().min(1),
    args: s.record(s.string(), s.unknown()),
  })
  .strict();
