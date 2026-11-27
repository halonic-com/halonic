import type { RailEntryContribution } from "@halonicjs/studio-shell";

/**
 * Code's entry in the icon rail (`files.rail-entry`): it shows while the folder is a code folder, or a workspace project with a code folder inside, such as `src/`.
 */
export const codeRailEntry: RailEntryContribution = {
  id: "code",
  label: "Code",
  icon: "code",
  order: 10,
  shows: (facts) => facts.kind === "code-folder" || facts.hasCodeFolderInside,
};
