import type { FileKind } from "../../kind.ts";
import { checkPlugin } from "./checks.ts";
import { Plugin } from "./schema.ts";

/**
 * `plugin.yaml`, at the root of a plugin folder. Plugins are installed in
 * the person's profile, never in a workspace, so it has no place; the
 * plugin service reads it.
 */
export const pluginKind: FileKind<Plugin> = {
  name: "plugin",
  about: "A plugin's manifest: its backend, local tools and the UI Studio draws for it.",
  syntax: "yaml",
  schema: Plugin,
  places: [],
  idFromPlace: "none",
  check: checkPlugin,
};
