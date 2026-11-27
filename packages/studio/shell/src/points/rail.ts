import type { Ordered } from "./point-store.ts";

/**
 * The kind of folder the window has open (HAL-20673 rail flows, section 0): a workspace project
 * has `workspace.yaml` at its root; a code folder has none, and keeps its items under `.halonic/`.
 */
export type FolderKind = "workspace-project" | "code-folder";

/** The open folder's git state, an axis apart from its kind. */
export type FolderGitState =
  | "repository"
  | "not-a-repository"
  | "inside-a-larger-repository"
  | "no-git-program";

/**
 * What the rail's rules may know about the open folder (`shell.rail-entries`). Every rule gets
 * the same facts, so no feature reads files or git to decide whether its entry shows.
 */
export interface FolderFacts {
  readonly kind: FolderKind;
  /**
   * Whether the folder holds items: always for a workspace project; for a code folder, while
   * `.halonic/` holds a file a registered kind places.
   */
  readonly hasItems: boolean;
  /** Whether a workspace project has a top-level folder no kind places, such as `src/`. */
  readonly hasCodeFolderInside: boolean;
  readonly git: FolderGitState;
  /** Whether the runs source holds at least one run for this folder. */
  readonly runsRecorded: boolean;
  /** How many Inbox items wait for an answer. */
  readonly waitingCount: number;
}

/**
 * The rail entries a feature may add. The set is fixed by design (the layout in HAL-20617): a feature
 * can't make up a sub-app. It is a list of names only, kept here so a misspelt entry fails at once;
 * the order, name, icon and rule belong to each entry.
 * Home and Settings are left out because the shell adds them itself.
 */
export const railEntryIds = ["code", "library", "messenger", "inbox", "runs", "changes"] as const;

/** One of the rail entries a feature may add. */
export type RailEntryId = (typeof railEntryIds)[number];

/** Any entry the rail shows: a feature's, or the shell's Home and Settings. */
export type ShownRailEntryId = RailEntryId | "home" | "settings";

/** One entry in the icon rail: a sub-app, its icon and when it shows. */
export interface RailEntry extends Ordered {
  readonly id: ShownRailEntryId;
  /** The name in the entry's tooltip and for screen readers, such as "Inbox". */
  readonly label: string;
  /** The icon's name, such as `inbox`. */
  readonly icon: string;
  /**
   * Where the entry sits among the features' entries: lower comes first, ties by `id`. The shell
   * keeps Home first and Settings at the bottom whatever the orders.
   */
  readonly order: number;
  /** Whether the entry shows for a folder with these facts. */
  shows(facts: FolderFacts): boolean;
}

/** A rail entry a feature adds through `rail.add`. */
export interface RailEntryContribution extends RailEntry {
  readonly id: RailEntryId;
}

/** Home's entry: the shell adds it, and it shows for every folder. */
export const homeRailEntry: RailEntry = {
  id: "home",
  label: "Home",
  icon: "home",
  order: 0,
  shows: () => true,
};

/** Settings' entry: the shell adds it at the bottom, apart from the others, for every folder. */
export const settingsRailEntry: RailEntry = {
  id: "settings",
  label: "Settings",
  icon: "settings",
  order: 0,
  shows: () => true,
};
