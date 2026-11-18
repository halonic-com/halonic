import type { LibraryItemKind } from "@halonicjs/app";

const kindNouns: Record<LibraryItemKind, string> = {
  skill: "skill",
  knowledge: "knowledge source",
  collection: "collection",
  connector: "connector",
};

/** The words of deleting a Library item (flow-library 4, microcopy 2, 7, 8.1, 11.3): no dialog, and Undo. There is no trash: saving deletes the file. */
export const deleteWords = {
  delete: "Delete",
  open: "Open",
  openInNewTab: "Open in new tab",
  openAsFile: "Open as file",
  undo: "Undo",
  tryAgain: "Try again",
  pageMenuLabel: (name: string) => `More actions for ${name}`,
  /** The toast's title: with a second line it is a sentence and ends with a full stop. */
  moved: (name: string, withLine: boolean) => `Deleted ${name}${withLine ? "." : ""}`,
  /** The page strip's text: one phrase with no full stop, or a sentence when a second line follows (microcopy 2, 11.3). */
  pageMoved: (kind: LibraryItemKind, withLine: boolean) =>
    `This ${kindNouns[kind]} was deleted${withLine ? "." : ""}`,
  /** The toast when the item couldn't be deleted; `reason` is a kinded error's sentence. */
  couldntMove: (name: string, reason: string | undefined) =>
    reason === undefined
      ? `Couldn't delete ${name}.`
      : `Couldn't delete ${name}: ${reason.replace(/\.$/, "")}.`,
  couldntUndo: (name: string) => `Couldn't put ${name} back`,
} as const;

/** The Open as file sheet's wording on a phone: the item pages' own loading and can't-load lines, for the kind. */
export const openAsFileWords = {
  kindName: (kind: LibraryItemKind) => kindNouns[kind],
  loading: (kind: LibraryItemKind, name: string) => `Loading ${name}`,
  /** A skill, a collection and a connector say "this *kind*"; a knowledge source names its item (microcopy 11.3). */
  couldntLoad: (kind: LibraryItemKind, name: string) =>
    kind === "knowledge" ? `Couldn't load ${name}` : `Couldn't load this ${kindNouns[kind]}`,
  tryAgain: deleteWords.tryAgain,
} as const;

/** Whether a phone can delete the kind: it can't remove what it can't make again (flow-library 8.1, phone layout 1.1). */
export function phoneCanDelete(kind: LibraryItemKind): boolean {
  return kind === "skill" || kind === "collection";
}
