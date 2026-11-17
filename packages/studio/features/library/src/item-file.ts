import { type LibraryItemKind, libraryItemPath } from "@halonicjs/app";
import type { LibraryItemPlace } from "./library-items-host.ts";

/** The file tab's item kind and hub part (the Files feature's `FILE_KIND` and `FILE_HUB`): files belong to the workspace folder. */
const fileKind = "file";
const fileHub = "workspace";

/**
 * The file "Open as file" shows for a Library item: a skill's `SKILL.md`, or the one file of the
 * other kinds. The paths are the workspace's folder layout, shared with the New dialogs.
 */
export function itemFilePath(kind: LibraryItemKind, place: LibraryItemPlace): string {
  return libraryItemPath(kind, place);
}

/** The tab item that shows {@link itemFilePath} in the code editor. */
export function itemFileRef(
  kind: LibraryItemKind,
  place: LibraryItemPlace,
): { readonly kind: string; readonly hub: string; readonly id: string } {
  return { kind: fileKind, hub: fileHub, id: itemFilePath(kind, place) };
}

/** The file's name as the Open as file sheet's title: `SKILL.md`, `claims.collection.yaml`. */
export function itemFileName(kind: LibraryItemKind, place: LibraryItemPlace): string {
  return itemFilePath(kind, place).split("/").pop() ?? place.id;
}
