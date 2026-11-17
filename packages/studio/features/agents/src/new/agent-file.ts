import { slugify, uniqueName } from "@halonicjs/std";

/** Where the agent files of a hub are kept, as the Files tree shows it. */
export function agentFolder(hubId: string): string {
  return `hubs/${hubId}/agents/`;
}

/**
 * The file a new agent lands in: the id comes from the name, with `-2` when the hub already
 * has that id (`shell.items.id-from-name`). With no name typed it is the folder alone, because
 * there is no file yet.
 *
 * @example
 * agentFilePath("acme", "Invoice intake", ["invoice-intake"]);
 * // "hubs/acme/agents/invoice-intake-2.agent.yaml"
 */
export function agentFilePath(
  hubId: string,
  name: string,
  takenIds: Iterable<string>,
): { readonly kind: "folder" | "file"; readonly path: string } {
  const folder = agentFolder(hubId);
  if (name.trim() === "") {
    return { kind: "folder", path: folder };
  }
  const id = uniqueName(slugify(name), takenIds);
  return { kind: "file", path: `${folder}${id}.agent.yaml` };
}
