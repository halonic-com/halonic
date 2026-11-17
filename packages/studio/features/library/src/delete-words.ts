import type { LibraryItemKind } from "@halonicjs/app";

const kindNouns: Record<LibraryItemKind, string> = {
  skill: "skill",
  knowledge: "knowledge source",
  collection: "collection",
  connector: "connector",
};

/** The words of deleting a Library item (flow-library 4, microcopy 2, 7, 8.1, 11.3): no dialog, the trash and Undo. */
export const deleteWords = {
  delete: "Delete",
  open: "Open",
  openInNewTab: "Open in new tab",
  openAsFile: "Open as file",
  undo: "Undo",
  tryAgain: "Try again",
  pageMenuLabel: (name: string) => `More actions for ${name}`,
  /** The toast's title: with a second line it is a sentence and ends with a full stop. */
  moved: (name: string, withLine: boolean) => `Moved ${name} to the trash${withLine ? "." : ""}`,
  /** The page strip's text, where the item stays under it. */
  pageMoved: (kind: LibraryItemKind) => `This ${kindNouns[kind]} was moved to the trash`,
  /** The toast when the item couldn't be moved; `reason` is a kinded error's sentence. */
  couldntMove: (name: string, reason: string | undefined) =>
    reason === undefined
      ? `Couldn't move ${name} to the trash.`
      : `Couldn't move ${name} to the trash: ${reason.replace(/\.$/, "")}.`,
  couldntUndo: (name: string) => `Couldn't put ${name} back`,
} as const;

/** The Open as file sheet's wording on a phone: the item pages' own loading and can't-load lines, for the kind. */
export const openAsFileWords = {
  loading: (kind: LibraryItemKind) => `Loading the ${kindNouns[kind]}`,
  couldntLoad: (kind: LibraryItemKind) => `Couldn't load the ${kindNouns[kind]}`,
  tryAgain: deleteWords.tryAgain,
} as const;

/** Whether a phone can delete the kind: it can't remove what it can't make again (flow-library 8.1, phone layout 1.1). */
export function phoneCanDelete(kind: LibraryItemKind): boolean {
  return kind === "skill" || kind === "collection";
}
