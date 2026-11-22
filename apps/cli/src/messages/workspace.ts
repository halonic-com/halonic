import { counted, listInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { type Phrase, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

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
  /**
   * The reason a run is refused when the workspace's files have errors, each
   * leaving a file out (HAL-6613, built on run's Couldn't line with Sofia),
   * naming the files so the user knows which one stops the run (C544-3):
   * "Couldn't run support-reply: Acme has 1 problem in
   * hubs/support/workflows/weekly-report.workflow.yaml. Nothing ran."
   * Two files are both named; from three on, the first and how many others.
   * With no file to name, as for an error in no file, "in its files".
   * `nothingDone` is "Nothing ran." or "Nothing was sent.".
   */
  fileProblems: (workspace: string, count: number, files: readonly string[], nothingDone: Phrase) =>
    phrase`${workspace} has ${counted(count, "problem", "problems")} in ${filesInWords(files)}. ${nothingDone}`,
  /**
   * Its fix, "See it with: halonic validate" for one problem and "See them
   * with: …" for more (C591 row 17); `dir` is the user's own `--dir`.
   */
  fileProblemsFix: (count: number, dir?: string) =>
    count === 1
      ? phrase`See it with: ${suggestedCommand("validate", dir)}`
      : phrase`See them with: ${suggestedCommand("validate", dir)}`,
  noWorkspaceFix: () =>
    phrase`Run it inside a workspace, create one with halonic init, or copy the example with halonic init --example acme.`,
  /**
   * The reason when another command already has the workspace's engine open,
   * such as a `halonic routines watch` in a second window: "Another Halonic
   * engine is open on this workspace (process 4242)."
   */
  engineOpen: (pid: number | undefined) =>
    pid === undefined
      ? phrase`Another Halonic engine is open on this workspace.`
      : phrase`Another Halonic engine is open on this workspace (process ${String(pid)}).`,
  /**
   * The reason when a CLI command holds the engine, as its lock names it
   * (HAL-14299): "halonic routines watch is running for this workspace
   * (process 4242)."
   */
  engineOpenBy: (command: string, pid: number) =>
    phrase`halonic ${command} is running for this workspace (process ${String(pid)}).`,
  engineOpenFix: () => phrase`Wait until it has finished or stop it, then run again.`,
  /**
   * The reason when a variable put the profile folder in the workspace, with
   * the profile's path, `~` for the home folder (HAL-15201, C637, C646):
   * "Couldn't open ./acme: your profile folder ~/acme/.profile is inside this
   * workspace."
   */
  profileInWorkspace: (profile: string) =>
    phrase`your profile folder ${profile} is inside this workspace.`,
  /**
   * Studio's fix (`shell.profile-place-words`), without its restart: always
   * names `HALONIC_HOME`, led by the variable that moved the profile when
   * that's another one, because `XDG_DATA_HOME` and `LOCALAPPDATA` point at
   * the parent folder, and `LOCALAPPDATA` moves every other app's data too
   * (Sofia's words, HAL-15232). `variable` is `HALONIC_HOME`,
   * `XDG_DATA_HOME` or `LOCALAPPDATA`.
   */
  profileInWorkspaceFix: (variable: string) =>
    variable === "HALONIC_HOME"
      ? phrase`A change to this workspace could change what you trust. Move the profile folder out, set HALONIC_HOME to its new place.`
      : phrase`${variable} puts it there. A change to this workspace could change what you trust. Move the profile folder out, set HALONIC_HOME to its new place.`,
  /** The reason when the workspace is inside the profile folder: "this workspace is inside your profile folder ~/.local/share/halonic." */
  workspaceInProfile: (profile: string) =>
    phrase`this workspace is inside your profile folder ${profile}.`,
  workspaceInProfileFix: () => phrase`Move the workspace somewhere else.`,
  /** The fix when the command that holds the engine runs until it is stopped, as `routines watch` and `serve` do. */
  engineOpenStopFix: () => phrase`Stop it with Ctrl C there, then run again.`,
});

/**
 * The files a refusal names: one or two by their paths, more as the first
 * and a count, so the line stays readable when a whole folder is broken.
 *
 * @example
 * filesInWords([]); // "its files"
 * filesInWords(["workspace.yaml"]); // "workspace.yaml"
 * filesInWords(["providers/mock.yaml", "workspace.yaml"]); // "providers/mock.yaml and workspace.yaml"
 * filesInWords(["a.yaml", "b.yaml", "c.yaml"]); // "a.yaml and 2 other files"
 */
function filesInWords(files: readonly string[]): string {
  if (files.length === 0) return "its files";
  if (files.length <= 2) return listInWords(files);
  const [first] = files;
  return `${first} and ${counted(files.length - 1, "other file", "other files")}`;
}
