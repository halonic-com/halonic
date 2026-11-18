import type { ItemRef } from "@halonicjs/studio-shell";

/** The item kind of a file in a tab; its place is `file/workspace/<path>`. */
export const FILE_KIND = "file";

/** The id of the file tree's view on the sidebar's switch. */
export const FILES_VIEW = "files";

/** The hub part of a file's place: files belong to the workspace folder, not to a hub. */
export const FILE_HUB = "workspace";

/** The item a file's tab shows. */
export function fileItem(path: string): ItemRef {
  return { kind: FILE_KIND, hub: FILE_HUB, id: path };
}

/** The last part of a path, such as `hub.yaml` for `hubs/p/hub.yaml`. */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
