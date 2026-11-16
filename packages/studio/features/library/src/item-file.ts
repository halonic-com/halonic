import type { LibraryItemKind } from "@halonicjs/app";
import type { LibraryItemPlace } from "./library-items-host.ts";

/** The file tab's item kind and hub part (the Files feature's `FILE_KIND` and `FILE_HUB`): files belong to the workspace folder. */
const fileKind = "file";
const fileHub = "workspace";

/**
 * The file "Open as file" shows for a Library item: a skill's `SKILL.md`, or the one file of the
 * other kinds. The paths are the workspace's folder layout.
 */
export function itemFilePath(kind: LibraryItemKind, { hub, id }: LibraryItemPlace): string {
  const root = hub === null ? "" : `hubs/${hub}/`;
  switch (kind) {
    case "skill":
      return `${root}library/skills/${id}/SKILL.md`;
    case "knowledge":
      return `${root}library/knowledge/${id}.yaml`;
    case "collection":
      return `${root}library/collections/${id}.collection.yaml`;
    case "connector":
      return `${root}library/connectors/${id}.connector.yaml`;
  }
}

/** The tab item that shows {@link itemFilePath} in the code editor. */
export function itemFileRef(
  kind: LibraryItemKind,
  place: LibraryItemPlace,
): { readonly kind: string; readonly hub: string; readonly id: string } {
  return { kind: fileKind, hub: fileHub, id: itemFilePath(kind, place) };
}
