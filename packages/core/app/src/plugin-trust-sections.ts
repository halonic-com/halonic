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
  programs: "Programs",
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

/**
 * The headings of the two lines under the sections: where the plugin sits
 * on disk and the files its fingerprint covers. Studio adds nothing after them.
 */
export const pluginTrustLocationHeadings = {
  folder: "Folder",
  files: "Backend files",
} as const;

/** How many files the trust check names before it says how many more there are. */
export const pluginTrustFileCap = 10;

/** The manifest, which the sections above already show, so it isn't listed as a file. */
const manifestPath = "plugin.yaml";

/** The plugin's files the fingerprint covers, as the check lists them. */
export interface PluginTrustFiles {
  /** The first files by path: {@link pluginTrustFileCap} of them, or all when only one more would follow. */
  readonly shown: readonly string[];
  /** How many files come after the ones shown: the "and N more". */
  readonly more: number;
}

/**
 * The files in the plugin's folder that the fingerprint covers, for the
 * check to list: the first {@link pluginTrustFileCap} by path, and how many
 * more there are. One more file is shown rather than "and 1 more", which
 * takes the same row and says less, so the list is at most one row over the cap. The manifest isn't one of them. The paths come from the
 * workspace, so a host escapes them before it shows them.
 *
 * @example
 * pluginTrustFiles(weather); // { shown: ["backend/index.js"], more: 0 }
 */
export function pluginTrustFiles(content: PluginTrustContent): PluginTrustFiles {
  const paths = content.files.map((file) => file.path).filter((path) => path !== manifestPath);
  const collapses = paths.length > pluginTrustFileCap + 1;
  const shownCount = collapses ? pluginTrustFileCap : paths.length;
  return { shown: paths.slice(0, shownCount), more: paths.length - shownCount };
}
