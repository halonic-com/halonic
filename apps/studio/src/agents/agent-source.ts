import type { DefinitionSource } from "@halonicjs/ports";
import { settingsPath } from "@halonicjs/workspace";
import { routineFolder } from "../routines/routine-files.ts";

/** Where the agent files of a hub are kept. */
export const agentFolder = (hubId: string): string => `hubs/${hubId}/agents`;

/** Where the workspace keeps the skills, knowledge and connectors its hubs share. */
const sharedLibraryFolder = "library";

/** The workspace's model aliases, which every hub can use. */
const modelsFile = "models.yaml";

/** The workspace's providers, for the key a model needs (H19). */
const providersFolder = "providers";

/**
 * The workspace's hubs, its shared library, its root routines (for the agent map), its
 * `models.yaml`, its providers and its settings as files, with unsaved changes applied, for `loadWorkspace`.
 */
export function unsavedWorkspaceSource(files: {
  read(path: string): Promise<string | null>;
  list(dir: string): Promise<string[]>;
}): DefinitionSource {
  const existing = async (path: string) => ((await files.read(path)) === null ? [] : [path]);
  return {
    location: "workspace:unsaved",
    list: async () => [
      ...(await files.list("hubs")),
      ...(await files.list(sharedLibraryFolder)),
      ...(await files.list(routineFolder(null))),
      ...(await existing(modelsFile)),
      ...(await files.list(providersFolder)),
      ...(await existing(settingsPath)),
    ],
    read: (path) => files.read(path),
    version: async () => "unsaved",
  };
}
