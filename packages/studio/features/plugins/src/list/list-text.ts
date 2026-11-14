// The words of Library › Plugins, from the plugin screens design section 3, microcopy 24 and the
// UX acceptance checklist (HAL-1739, HAL-751, HAL-1952). A plugin's name, description and problems
// are only ever a value in these lines.

import type { Plugin } from "@halonicjs/format";
import { quoted } from "../page/page-text.ts";

/** The tab's name, and the list's accessible name. */
export const PLUGINS = "Plugins";

/** The sentence under the tab bar. */
export const PLUGINS_SENTENCE =
  "Plugins add services, tools and cards to Halonic. They're installed on this computer, for every workspace.";

/** The two sections. */
export const INSTALLED_HEADING = "Installed on this computer";
export const BUILT_IN_HEADING = "Built in";

/** The button that opens the Add plugin dialog. */
export const ADD_PLUGIN = "Add plugin";

/** The chips: neutral unless broken. */
export const NOT_TRUSTED_CHIP = "Not trusted yet";
export const CHANGED_CHIP = "Changed since you trusted it";
export const BUILT_IN_CHIP = "Built in";

/** The chip of a plugin that can't load: "1 error", "2 errors". */
export function errorsChip(count: number): string {
  return count === 1 ? "1 error" : `${count} errors`;
}

/** The empty list. */
export const EMPTY_TITLE = "No plugins yet";
export const EMPTY_LINE =
  "A plugin adds a service, tools or cards to Halonic. Add one from a folder or a git repository.";

/** The list that couldn't load. */
export const LOAD_FAILED_TITLE = "Couldn't load your plugins";
export const TRY_AGAIN = "Try again";
export const LOADING_LABEL = "Loading plugins";

/** The ⋮ menu's items. */
export const OPEN = "Open";
export const OPEN_IN_NEW_TAB = "Open in new tab";

/** What a built-in plugin's row says where a description would be. */
export const COMES_WITH_HALONIC = "Comes with Halonic";

/** The ⋮ button's accessible name. */
export function moreFor(name: string): string {
  return `More actions for ${name}`;
}

function counted(count: number, one: string, many: string): string | undefined {
  if (count === 0) return undefined;
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/**
 * What a plugin adds, in the row's second half: "2 tools · settings · 1 command · 1 card · a
 * panel". `""` for a plugin that adds nothing.
 */
export function addsLine(manifest: Plugin): string {
  const tools =
    (manifest.backend?.tools.length ?? 0) +
    (manifest.localTools ?? []).reduce((count, local) => count + local.tools.length, 0);
  return [
    counted(tools, "tool", "tools"),
    Object.keys(manifest.ui?.settings ?? {}).length === 0 ? undefined : "settings",
    counted(manifest.ui?.commands.length ?? 0, "command", "commands"),
    counted(manifest.ui?.cards.length ?? 0, "card", "cards"),
    manifest.ui?.panel === undefined ? undefined : "a panel",
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

/** The row's line under the name: the description, then what it adds. */
export function rowMeta(manifest: Plugin | undefined): string | undefined {
  if (manifest === undefined) return undefined;
  const line = [manifest.description === "" ? "" : quoted(manifest.description), addsLine(manifest)]
    .filter((part) => part !== "")
    .join(" · ");
  return line === "" ? undefined : line;
}
