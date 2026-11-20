import { writeYamlFile } from "@halonicjs/yaml";

/**
 * The id of the hub a workspace gets when it has none: a new workspace's template writes it, and
 * Studio's New agent and New workflow write it with the first agent or workflow of a folder that
 * has no hub yet. One id and name, so both ways end in the same folder (board answer, HAL-12723).
 */
export const defaultHubId = "default";

/** The name of the hub with the id {@link defaultHubId}. */
export const defaultHubName = "Default";

/** Where the Default hub's `hub.yaml` goes, from the workspace folder. */
export const defaultHubPath = `hubs/${defaultHubId}/hub.yaml`;

/**
 * The text of the Default hub's `hub.yaml`: its id and its name.
 *
 * @example
 * defaultHubText(); // "id: default\nname: Default\n"
 */
export function defaultHubText(): string {
  return writeYamlFile({ id: defaultHubId, name: defaultHubName });
}
