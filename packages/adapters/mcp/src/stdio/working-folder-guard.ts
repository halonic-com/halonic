import { readdir, realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type ConnectorStart,
  type FolderLookup,
  touchesWorkingFolder,
  workingFolderRefusal,
} from "@halonicjs/format";
import type { AgentWorkingFolders } from "./program.ts";

/** Node's way to look at folders, for the shared working folder check. */
const nodeFolders: FolderLookup = {
  resolve,
  realpath,
  list: (folder) => readdir(folder).catch(() => []),
  isFile: (path) =>
    stat(path).then(
      (found) => found.isFile(),
      () => false,
    ),
};

/**
 * Refuses a start that would run or load a file from a harness agent's
 * working folder, on the real file system (`format.working-folder-start`).
 * Every stdio starter calls it before its program runs: on this computer
 * and in a sandbox. Does nothing when there are no working folders.
 *
 * @param start - the start, with absolute `cwd`; `env` holds only what the connector file writes
 * @throws the refusal, naming the working folder and how the start reaches it
 */
export async function refuseWorkingFolders(
  start: ConnectorStart,
  guard: AgentWorkingFolders | undefined,
): Promise<void> {
  if (guard === undefined) return;
  const reach = await touchesWorkingFolder(start, guard.workspaceRoot, guard.folders, nodeFolders);
  if (reach !== null) throw new Error(workingFolderRefusal(reach));
}
