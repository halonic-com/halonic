import { rm } from "node:fs/promises";
import { join } from "node:path";
import { privateFileAt } from "./private-file.ts";

/** The folder in the profile that holds the integrations' local request logs. */
const requestLogsFolderName = "integration-logs";

/**
 * The files of `@halonicjs/app`'s `RequestLogStore` on this machine, in
 * `integration-logs/<workspace key>/<integration id>.jsonl` in the profile,
 * never in a workspace. Each is a private file: mode `600` in a folder only
 * the person may open, a link in its place refused, and replaced through a
 * rename. The store checks the workspace key and the file name before it
 * passes them, so neither can lead out of the folder.
 *
 * @param profileRoot - the profile folder's root, from `profileFolder`
 */
export function requestLogFilesIn(profileRoot: string) {
  const folder = join(profileRoot, requestLogsFolderName);
  const fileAt = (workspace: string, file: string) => join(folder, workspace, file);
  return {
    read: (workspace: string, file: string) => privateFileAt(fileAt(workspace, file)).read(),
    write: (workspace: string, file: string, text: string) =>
      privateFileAt(fileAt(workspace, file)).write(text),
    remove: (workspace: string, file: string) => rm(fileAt(workspace, file), { force: true }),
    removeWorkspace: (workspace: string) =>
      rm(join(folder, workspace), { recursive: true, force: true }),
  };
}
