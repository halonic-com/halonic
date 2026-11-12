// The sections of a plugin's trust check, as `app.plugin-trust-sections`
// asks: which ones show, in which order and under which heading (HAL-1739
// design, section 5). `halonic plugin add` and Studio's trust check both
// read them from here, so a person sees the same check in either place
// (P8 parity check). Each host draws a section's rows in its own way.

import type { PluginTrustContent } from "./plugin-trust-content.ts";

/** One section of a plugin's trust check. */
export type PluginTrustSection = "tools" | "programs" | "secrets" | "addresses" | "in-studio";

/**
 * Every section in the order the check shows them: risk order, as the
 * workspace check, then what Studio draws itself.
 */
export const pluginTrustSectionOrder: readonly PluginTrustSection[] = [
  "tools",
  "programs",
  "secrets",
  "addresses",
  "in-studio",
];

/** Each section's heading, word for word from the design. Studio adds the count after it. */
export const pluginTrustSectionHeadings: Readonly<Record<PluginTrustSection, string>> = {
  tools: "Tools for agents",
  programs: "Programs on this computer",
  secrets: "Secrets",
  addresses: "Addresses",
  "in-studio": "In Studio",
};

/**
 * The sections the plugin's check shows, in order: only those that have
 * something in them.
 *
 * @example
 * pluginTrustSections(weather); // ["tools", "programs", "secrets", "addresses", "in-studio"]
 */
export function pluginTrustSections(content: PluginTrustContent): PluginTrustSection[] {
  return pluginTrustSectionOrder.filter((section) => hasSomething(content, section));
}

function hasSomething(content: PluginTrustContent, section: PluginTrustSection): boolean {
  switch (section) {
    case "tools":
      return content.tools.length > 0;
    case "programs":
      return content.localTools.length > 0;
    case "secrets":
      return content.secrets.length > 0;
    case "addresses":
      return content.hosts.length > 0;
    case "in-studio":
      return addsToStudio(content);
  }
}

/** Whether the plugin's `ui` gives Studio settings, a command, a card or a panel to draw. */
function addsToStudio(content: PluginTrustContent): boolean {
  const ui = content.manifest.ui;
  if (ui === undefined) return false;
  return (
    Object.keys(ui.settings ?? {}).length > 0 ||
    (ui.commands ?? []).length > 0 ||
    (ui.cards ?? []).length > 0 ||
    ui.panel !== undefined
  );
}
