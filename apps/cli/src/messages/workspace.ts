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
  noWorkspaceFix: () => phrase`Run it inside a workspace, or create one with halonic init.`,
});
