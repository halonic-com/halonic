// A workspace folder read as `doctor` checks it: its files, what the trust
// check covers, and whether Studio's folder watch would look at it. The CLI
// and the agent host read a folder this one way, so their Workspace lines
// agree about the same folder (HAL-13407).

import { realpath } from "node:fs/promises";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { filesOf, type LoadedWorkspace, loadWorkspace, settingsPath } from "@halonicjs/workspace";
import { type CommandSearch, commandPaths } from "./command-paths.ts";
import type { MachineWorkspace } from "./doctor-machine.ts";
import { doctorWorkspace } from "./doctor-workspace.ts";
import { workspaceConnectorFiles, workspaceIntegrations } from "./workspace-integrations.ts";

/** A workspace folder, as the caller names it. */
export interface DoctorFolder {
  /** The full path, for the file system. */
  readonly root: string;
  /** The folder as the person would type it, such as `./acme`, for the words. */
  readonly shown: string;
  /** The folder's own name: the workspace's name when `workspace.yaml` has none. */
  readonly name: string;
}

/** How {@link readDoctorWorkspace} reads the folder. */
export interface ReadWorkspaceOptions {
  /** The most files Studio watches; a folder with more gets `tooManyFilesToWatch`. */
  readonly watchedFileLimit: number;
  /** Where the connectors' programs are looked for, as the trust check fingerprints them. */
  readonly commandSearch: CommandSearch;
  /**
   * The profile folder's root, fenced off so it is never read as the
   * workspace's files, even when the workspace holds it (HAL-15201).
   */
  readonly fence?: string;
}

/** The workspace {@link readDoctorWorkspace} read, for the doctor and as it loaded. */
export interface ReadWorkspace extends MachineWorkspace {
  /** The workspace as `loadWorkspace` gave it, for what a caller adds, such as the provider key agents. */
  readonly loaded: LoadedWorkspace;
  /** The folder's real path: the trust record's key. */
  readonly location: string;
}

/**
 * The workspace in `folder`, or `null` when it has no `workspace.yaml`. It
 * counts the files up to `watchedFileLimit`, so the Workspace line can say
 * when Studio won't watch the folder (HAL-12295). It reads and never writes.
 *
 * @throws when the folder can't be read
 */
export async function readDoctorWorkspace(
  folder: DoctorFolder,
  options: ReadWorkspaceOptions,
): Promise<ReadWorkspace | null> {
  const store = new FolderDefinitionStore(
    folder.root,
    folder.shown,
    options.fence === undefined ? {} : { fence: options.fence },
  );
  if ((await store.read(settingsPath)) === null) return null;
  const loaded = await loadWorkspace(store);
  const connectors = filesOf(loaded, "connector").map((file) => file.value);
  const location = await realpath(folder.root);
  const workspace = doctorWorkspace({
    workspace: loaded,
    integrations: await workspaceIntegrations(folder.root, folder.shown),
    location,
    fallbackName: folder.name,
    commandPaths: await commandPaths(connectors, options.commandSearch),
    connectorFiles: await workspaceConnectorFiles(folder.root, folder.shown, connectors),
  });
  const tooManyToWatch = await store.hasMoreFilesThan(options.watchedFileLimit);
  const providerFiles = new Map(
    filesOf(loaded, "provider").map((file) => [file.value.id, file.value]),
  );
  return {
    workspace: tooManyToWatch
      ? { ...workspace, tooManyFilesToWatch: options.watchedFileLimit }
      : workspace,
    providerFiles,
    loaded,
    location,
  };
}
