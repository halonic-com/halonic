import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * The sentences every command that reads a workspace shares (cli-output
 * section 3, "Which folder", and the "Not a workspace" rows of 3.2 and 3.4).
 */
export const workspaceMessages = defineMessages("workspace", {
  /** The help line of `--dir <folder>`. */
  dirOption: () => phrase`The workspace folder, if it isn't the current one.`,
  /** The reason when the folder has no workspace in it: "Couldn't check ./downloads: there's no workspace.yaml here." */
  noWorkspace: () => phrase`there's no workspace.yaml here.`,
  /** The reason when the folder itself can't be read, such as for its permissions: "Couldn't check acme: the folder can't be read." */
  folderUnreadable: () => phrase`the folder can't be read.`,
  folderUnreadableFix: () => phrase`Check the folder's permissions.`,
  /** The reason when the folder reads but a file in it can't, worded as the loader words it: "the workspace file workspace.yaml can't be read." */
  fileUnreadable: (path: string) => phrase`the workspace file ${path} can't be read.`,
  fileUnreadableFix: () => phrase`Check the file's permissions, or move it out of the workspace.`,
  noWorkspaceFix: () =>
    phrase`Run it inside a workspace, create one with halonic init, or copy the example with halonic init --example acme.`,
});
