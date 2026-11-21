import { writeYamlFile } from "@halonicjs/yaml";

/**
 * The hub a workspace gets when it has none: a new workspace's template writes it, and Studio's
 * New agent and New workflow write it with the first agent or workflow of a folder that has no
 * hub yet. One id and name, so both ways end in the same folder (board answer, HAL-12723).
 */
export const defaultHub: { readonly id: string; readonly name: string } = {
  id: "default",
  name: "Default",
};

/** Where the {@link defaultHub}'s `hub.yaml` goes, from the workspace folder. */
export const defaultHubPath = `hubs/${defaultHub.id}/hub.yaml`;

/**
 * The text of the {@link defaultHub}'s `hub.yaml`: its id and its name.
 *
 * @example
 * defaultHubText(); // "id: default\nname: Default\n"
 */
export function defaultHubText(): string {
  return writeYamlFile({ id: defaultHub.id, name: defaultHub.name });
}
