import { type PluginEntry, type PluginInstall, pluginTrustFiles } from "@halonicjs/app";
import type { InstalledPlugin } from "@halonicjs/studio-feature-plugins";

/**
 * One plugin folder as the plugins feature draws it: its panel, cards and commands, its trust and
 * where it came from. A plugin that is off still gives its `ui`, so its cards and panel keep
 * their place and say why they are off. A plugin that can't load has no manifest and is named by
 * its folder.
 *
 * @param entry - what `PluginService.load` found
 * @param install - the plugin's install record, when it was added through `plugin add`
 */
export function installedPluginOf(
  entry: PluginEntry,
  install: PluginInstall | null,
): InstalledPlugin {
  if (entry.status === "broken") {
    return {
      plugin: entry.folder,
      name: entry.folder,
      status: "cant-load",
      cards: [],
      commands: [],
      problems: entry.problems.map(({ file, path, message }) => ({ file, path, message })),
    };
  }
  const { plugin } = entry;
  return {
    plugin: entry.folder,
    name: plugin.name,
    status: statusOf(entry.status),
    cards: plugin.ui?.cards ?? [],
    commands: plugin.ui?.commands ?? [],
    panel: plugin.ui?.panel === undefined ? undefined : { title: plugin.ui.panel.title },
    manifest: plugin,
    trustedAt:
      entry.status === "trusted" || entry.status === "changed" ? entry.trustedAt : undefined,
    origin: install?.source,
    changes: entry.status === "changed" ? entry.changes : undefined,
    location: entry.location,
    backendFiles: pluginTrustFiles(entry.content),
    problems: [],
  };
}

/** Whether the plugin is on: only a trusted one is; a record that can't be read leaves it off. */
function statusOf(status: "trusted" | "new" | "changed" | "unreadable"): InstalledPlugin["status"] {
  if (status === "trusted") return "on";
  return status === "changed" ? "changed" : "not-trusted";
}
