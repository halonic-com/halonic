// The words of a plugin's panel, from the plugin screens design section 8.3,
// microcopy 24 T12 and T16, and the UX acceptance checklist 9 and G7
// (HAL-1739, HAL-1952). The plugin's name and the panel's title are only
// ever a value in these lines.

/** The kind above the panel's title, in small caps. */
export const PLUGIN_PANEL = "Plugin panel";

/** The panel's command in Ctrl K: "Open Weather panel". */
export function openPanelTitle(name: string): string {
  return `Open ${name} panel`;
}

/** The panel's last line, in muted text. */
export function closingLine(name: string): string {
  return `Everything on this page comes from the ${name} plugin and is drawn by Halonic.`;
}

/** Why the commands are off while the plugin isn't trusted yet (T12). */
export const NOT_TRUSTED_LINE = "Nothing from this plugin runs until you trust it.";

/** Why the commands are off while the plugin changed since it was trusted (T12). */
export const CHANGED_LINE = "It's off until you look at what changed.";

/** Why the commands are off while the plugin can't load (T12). */
export function cantLoadPluginLine(name: string): string {
  return `${name} couldn't load. Its tools, commands and cards are off until its plugin.yaml is fixed.`;
}
