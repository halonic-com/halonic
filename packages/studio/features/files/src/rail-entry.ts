import type { RailEntryContribution } from "@halonicjs/studio-shell";
import { CODE_KIND, codePageKey } from "./code-page.ts";
import { FILE_KIND } from "./file-item.ts";

/**
 * Code's entry in the icon rail (`files.rail-entry`): it shows while the folder is a code folder,
 * or a workspace project with a code folder inside, such as `src/`.
 */
export const codeRailEntry: RailEntryContribution = {
  id: "code",
  label: "Code",
  icon: "code",
  order: 10,
  // Files have no place, so the Code entry holds their kind, and its page's, itself.
  holds: [CODE_KIND, FILE_KIND],
  // Code's page: the file tree in the list column, the file in the content pane
  // (`files.code-page`).
  opens: codePageKey,
  shows: (facts) => facts.kind === "code-folder" || facts.hasCodeFolderInside,
};
