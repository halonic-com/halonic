import { slugify, uniqueName } from "@halonicjs/std";

/** Where the workflow files of a hub are kept, as the Files tree shows it. */
export function workflowFolder(hubId: string): string {
  return `hubs/${hubId}/workflows/`;
}

/**
 * The file a new workflow lands in: the id comes from the name, with `-2` when the hub already
 * has that id (`shell.items.id-from-name`). With no name typed it is the folder alone, because
 * there is no file yet.
 *
 * @example
 * workflowFilePath("acme", "Invoice intake", ["invoice-intake"]);
 * // "hubs/acme/workflows/invoice-intake-2.workflow.yaml"
 */
export function workflowFilePath(
  hubId: string,
  name: string,
  takenIds: Iterable<string>,
): { readonly kind: "folder" | "file"; readonly path: string } {
  const folder = workflowFolder(hubId);
  if (name.trim() === "") {
    return { kind: "folder", path: folder };
  }
  const id = uniqueName(slugify(name), takenIds);
  return { kind: "file", path: `${folder}${id}.workflow.yaml` };
}
