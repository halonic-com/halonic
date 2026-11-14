import type { LibraryItemKind } from "@halonicjs/app";
import type { OverviewWords } from "@halonicjs/studio-shell";

/** The Library's tabs, in the shell's order (Alt+4 to Alt+7). */
export const libraryKinds: readonly LibraryItemKind[] = [
  "skill",
  "knowledge",
  "collection",
  "connector",
];

/** The words of one tab: microcopy 11.1 and flow-library 3.1. */
interface KindWords {
  /** The tab's label and the plural in the page's lines. */
  readonly plural: string;
  /** The one sentence under the title. */
  readonly sentence: string;
  /** "No skills match …": knowledge is the one kind that takes "matches". */
  readonly matches: string;
  readonly nothingYet: { readonly title: string; readonly description: string };
  /** The kind's New button; knowledge has none, its empty state says how to add one. */
  readonly newLabel?: string;
}

const kindWords: Record<LibraryItemKind, KindWords> = {
  skill: {
    plural: "skills",
    sentence: "Instructions your agents can pick up when a task calls for them.",
    matches: "match",
    nothingYet: {
      title: "No skills yet",
      description:
        "A skill is a set of instructions an agent picks up when a task calls for it, like how to handle a refund.",
    },
    newLabel: "New skill",
  },
  knowledge: {
    plural: "knowledge",
    sentence: "Documents your agents can search.",
    matches: "matches",
    nothingYet: {
      title: "No knowledge yet",
      description:
        "A knowledge source is a folder of documents your agents can search. Put documents in the hub's docs folder, then give it to an agent under Tools.",
    },
  },
  collection: {
    plural: "collections",
    sentence: "Tables of records your agents keep, like claims or contacts.",
    matches: "match",
    nothingYet: {
      title: "No collections yet",
      description: "A collection is a table of records your agents keep, like claims or contacts.",
    },
    newLabel: "New collection",
  },
  connector: {
    plural: "connectors",
    sentence: "The services and programs your agents reach, and which of their tools they may use.",
    matches: "match",
    nothingYet: {
      title: "No connectors yet",
      description:
        "A connector lets your agents reach a service, like your Gmail inbox or an MCP server.",
    },
    newLabel: "New connector",
  },
};

/** The tab's label: "Skills". */
export function tabLabel(kind: LibraryItemKind): string {
  const { plural } = kindWords[kind];
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/** The one sentence under the title for the tab. */
export function tabSentence(kind: LibraryItemKind): string {
  return kindWords[kind].sentence;
}

/** The New button's label for the tab, or `undefined` when the tab has none. */
export function newLabel(kind: LibraryItemKind): string | undefined {
  return kindWords[kind].newLabel;
}

/** "Couldn't load skills". */
export function couldntLoad(kind: LibraryItemKind): string {
  return `Couldn't load ${kindWords[kind].plural}`;
}

/** The words the shell's overview page needs for one tab. */
export function overviewWords(kind: LibraryItemKind): OverviewWords {
  const { plural, matches, nothingYet } = kindWords[kind];
  return {
    searchLabel: `Search for ${plural}`,
    loadingLabel: `Loading ${plural}`,
    chipsLabel: "Hub",
    allChip: "All",
    sharedChip: (workspaceName) => `Shared in ${workspaceName}`,
    moreLabel: (itemName) => `More actions for ${itemName}`,
    sharedSection: (workspaceName) => `Shared in ${workspaceName}`,
    emptySection: (sectionName) => `No ${plural} in ${sectionName} yet.`,
    noMatch: (query) => `No ${plural} ${matches} “${query}”.`,
    nothingYet,
  };
}
