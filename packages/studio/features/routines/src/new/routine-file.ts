import { slugify, uniqueName } from "@halonicjs/std";

/** Where the routine files of a hub are kept, as the Files tree shows it. */
export function routineFolder(hubId: string): string {
  return `hubs/${hubId}/workflows/routines/`;
}

/**
 * The file a new routine lands in: the id comes from the name, with `-2` when the hub already
 * has that id (`shell.items.id-from-name`). With no name typed it is the folder alone, because
 * there is no file yet.
 *
 * @example
 * routineFilePath("acme", "Morning digest", ["morning-digest"]);
 * // "hubs/acme/workflows/routines/morning-digest-2.routine.yaml"
 */
export function routineFilePath(
  hubId: string,
  name: string,
  takenIds: Iterable<string>,
): { readonly kind: "folder" | "file"; readonly path: string } {
  const folder = routineFolder(hubId);
  if (name.trim() === "") {
    return { kind: "folder", path: folder };
  }
  const id = uniqueName(slugify(name), takenIds);
  return { kind: "file", path: `${folder}${id}.routine.yaml` };
}
