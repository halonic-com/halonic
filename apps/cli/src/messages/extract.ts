import { counted } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { bold, dim, markPart, type Phrase, phrase } from "./phrase.ts";

/** How many files of each part a new workspace got, for the dimmed line under the ✓ line. */
export interface ExtractCounts {
  readonly hub: number;
  readonly shared: number;
  readonly workspace: number;
}

/** The shared items a hub took along, by kind. */
export interface ExtractUses {
  readonly connectors: readonly string[];
  readonly skills: readonly string[];
  readonly knowledge: readonly string[];
  readonly collections: readonly string[];
}

/**
 * The sentences of `halonic extract <hub> <folder>` (HAL-4845, in the style
 * of `init`, cli-output 3.1). The ✓ and ✕ marks, the `Next:` block's columns
 * and the indent are the printer's; these are the words.
 */
export const extractMessages = defineMessages("extract", {
  summary: () => phrase`Move a hub into a new workspace of its own`,
  /** What `extract` was doing, for "✕ Couldn't extract the hub family to ./family: …". */
  action: (hub: string, folder: string) => phrase`extract the hub ${hub} to ${folder}`,

  extracted: (name: string, folder: string, source: string) =>
    phrase`Extracted the hub ${name} to ${bold(folder)}. ${source} is unchanged.`,
  /** The dimmed line under the ✓ line. */
  counts: (counts: ExtractCounts) => countsLine(counts),
  /** The dimmed line with the shared items taken along, when there are any. */
  shared: (uses: ExtractUses) => sharedLine(uses),

  nextValidate: () => phrase`halonic validate`,
  nextValidateWhy: () => [dim("check the new workspace")],
  nextTrust: () => phrase`halonic trust`,
  nextTrustWhy: () => [dim("trust it on this computer before a run")],
  /** The last `Next:` line: the old copy of the hub stays until the user removes it. */
  nextRemove: (hub: string, source: string) => [
    dim(`Once it runs, remove hubs/${hub} from ${source}.`),
  ],

  /** The first line of `--dry-run`. */
  wouldExtract: (name: string, folder: string) =>
    phrase`Would extract the hub ${name} to ${bold(folder)}. Nothing was written.`,
  partHub: () => phrase`From the hub:`,
  partShared: () => phrase`Shared items:`,
  partWorkspace: () => phrase`Workspace files:`,
  /** After `workspace.yaml` in the dry run's list. */
  newSettings: () => [dim("with the hub's id, name and description")],
  dryRunAgain: () => [dim("Run it again without --dry-run to write these files.")],

  /** The help line for `--dry-run`. */
  dryRunOption: () => phrase`List the files it would write, and write nothing.`,

  /** The usage problem when the hub or the folder is missing, or there are more. */
  takesHubAndFolder: () => phrase`halonic extract takes a hub and a new folder.`,
  insideSource: (source: string) =>
    phrase`The new workspace can't go inside ${source}, the one it comes from.`,
  insideSourceFix: () => phrase`Pick a folder outside it, such as one next to it.`,

  unknownHub: (hub: string, workspace: string) =>
    phrase`There's no hub called "${hub}" in ${workspace}.`,
  unknownHubNear: (hub: string, workspace: string, near: string) =>
    phrase`There's no hub called "${hub}" in ${workspace}. Did you mean ${near}?`,
  /** The fix line after an unknown hub: the ones there are. */
  hubs: (hubs: readonly string[]) => phrase`Hubs: ${hubs.join(", ")}`,
  noHubs: (workspace: string) => phrase`There's no hub in ${workspace} to extract.`,
  noHubsFix: () => phrase`Only a hub in its own folder under hubs/ can move out.`,

  /** The reason when the workspace has errors (`conflict`, exit 5). */
  hasErrors: (errors: number) =>
    phrase`the workspace has ${counted(errors, "error", "errors")}, and a copy would keep them.`,
  hasErrorsFix: () => phrase`Run halonic validate to see them, fix them, then extract again.`,
  /** The reason when the new folder has files in it (`conflict`, exit 5). */
  notEmpty: () => phrase`the folder isn't empty.`,
  notEmptyFix: () => phrase`Pick a new folder name.`,
});

/** "3 hub files · 8 shared files · 5 workspace files", all dimmed, with the separator as a mark. */
function countsLine(counts: ExtractCounts): Phrase {
  const facts = [
    counted(counts.hub, "hub file", "hub files"),
    counted(counts.shared, "shared file", "shared files"),
    counted(counts.workspace, "workspace file", "workspace files"),
  ];
  return facts.flatMap((fact, index) =>
    index === 0 ? [dim(fact)] : [" ", markPart("separator"), " ", dim(fact)],
  );
}

/**
 * "Shared items: skills: tone · collections: chores, people", all dimmed, with the
 * separator as a mark like the counts line: only the kinds that have items.
 */
function sharedLine(uses: ExtractUses): Phrase {
  const kinds: [string, readonly string[]][] = [
    ["connectors", uses.connectors],
    ["skills", uses.skills],
    ["knowledge", uses.knowledge],
    ["collections", uses.collections],
  ];
  const facts = kinds
    .filter(([, ids]) => ids.length > 0)
    .map(([kind, ids]) => `${kind}: ${ids.join(", ")}`);
  return facts.flatMap((fact, index) =>
    index === 0 ? [dim(`Shared items: ${fact}`)] : [" ", markPart("separator"), " ", dim(fact)],
  );
}
