/** The words the file tree shows (microcopy for the Files frames). */
export const filesWords = {
  treeLabel: "Files",
  loading: "Loading files",
  emptyTitle: "Everything in this workspace is a file.",
  emptyDescription: "Add one with +.",
  errorTitle: "Couldn't load files",
  retry: "Try again",
  retrying: "Checking…",
  /** The screen-reader name of an error count on a row. */
  errors: (count: number): string => `${count} ${count === 1 ? "error" : "errors"}`,
  warnings: (count: number): string => `${count} ${count === 1 ? "warning" : "warnings"}`,
  /** The "not saved" mark on a file, or on a folder with such a file in it. */
  outside: "not saved",
  /** The name of a folder row that has marks: "*agents*, folder, a file inside not saved, 3 errors". */
  folderMarks: (name: string, marks: string): string => `${name}, folder, ${marks}`,
  /** The mark's words on a folder: the file that isn't saved is inside it. */
  outsideInside: "a file inside not saved",
  /** The kind of a file's tab, as a screen reader reads it after the name. */
  fileKind: "file",
  fileLoading: "Loading the file",
  /** The editor's name for a screen reader: "a.agent.yaml, YAML editor". */
  editorLabel: (name: string, language: "YAML" | "Markdown" | "text"): string =>
    `${name}, ${language} editor. Press Escape, then Tab, to leave the editor.`,
  missingTitle: "This file isn't in this workspace any more.",
  goToFiles: "Go to Files",
  /** The strip above the greyed editor of a file that was moved to the trash; Undo follows. */
  trashed: "This file was moved to the trash",
  unreadableTitle: "Couldn't open this file",
  /** The line above the editor of a file over the size limit. */
  largeFile: "This file is large, so it opens read-only.",
  /** What a file that isn't text says in place of the editor, with its size as the description. */
  notTextTitle: "This file can't be shown here.",
  notTextDescription: (size: string): string => `It is ${size}.`,
  /** The strip above the editor of a file with unsaved changes that changed outside Halonic. */
  changedOutside: " changed outside Halonic",
  deletedOutside: " was deleted outside Halonic.",
  compare: "Compare",
  keepMine: "Keep mine",
  useOther: "Use the other one",
  combineBoth: "Combine both",
  close: "Close",
  cancel: "Cancel",
  /** The name of Compare, read when it opens and when focus lands on it. */
  compareName: (name: string): string => `Compare ${name}`,
  /** The line after a choice in the strip or in Compare. */
  settled: {
    "keep-mine": "Keeping yours",
    "use-other": "Using the other one",
    "combine-both": "Combined",
  },
  compareMine: "Yours",
  compareTheirs: "In the folder now",
  compareNone: "No file",
  compareLoading: "Loading both texts",
  /** What shows when a choice in Compare can't be saved. */
  compareFailed: (reason: string): string => `Couldn't apply your choice: ${reason}`,
  newFile: "New file",
  newFileTitle: "New file",
  path: "Path",
  pathHint: "Folders that don't exist yet are created.",
  create: "Create",
  creating: "Creating…",
  pathMissing: "Give the file a name, like hubs/support/agents/new.agent.yaml.",
  pathOutside: "Files must stay inside the workspace.",
  /** Under the Path field: the host's sentences about the path itself. */
  pathFile: (path: string): string => `${path} is a file, not a folder.`,
  pathFolder: (path: string): string => `${path} is a folder.`,
  pathTaken: (path: string): string => `${path} already exists.`,
  /** The Callout of New file when the write itself failed; Try again follows. */
  couldntCreate: (path: string, reason: string | undefined): string =>
    reason === undefined
      ? `Couldn't create ${path}.`
      : `Couldn't create ${path}: ${reason.replace(/\.$/, "")}.`,
  pathPrivate: (path: string): string => `"${path}" is not part of the workspace definitions`,
  /** The name of the field that edits a file's name in its row, for a screen reader. */
  renameLabel: (name: string): string => `Name of ${name}`,
  /** Under the name being edited in its row when it holds a `/`. */
  renameSlash: "A name can't contain /.",
  /** When the host gave no sentence for a refused rename. */
  couldntRename: (path: string): string => `Couldn't rename to ${path}.`,
  /** The second line of the rename toast: how many places in other files change, and whose they are. */
  alsoUpdated: (count: number, owners: readonly string[]): string =>
    `Also updated ${count} ${count === 1 ? "place" : "places"}${owners.length > 0 ? `: ${owners.join(", ")}` : ""}.`,
  /** The toast after a rename, with the new path. */
  renamed: (path: string): string => `Renamed to ${path}`,
  /** The toast when Undo can't move a renamed file back. */
  couldntMoveBack: (path: string): string => `Couldn't move ${path} back`,
  /** The toast after a delete: with a second line it is a sentence and ends with a full stop. */
  deleted: (path: string, withLine: boolean): string =>
    `Moved ${path} to the trash${withLine ? "." : ""}`,
  /** The second line of that toast when other files name the deleted one by its id. */
  deletedPlaces: (count: number): string =>
    count === 1
      ? "1 place now shows an error until you update it."
      : `${count} places now show an error until you update them.`,
  undo: "Undo",
  tryAgain: "Try again",
  couldntDelete: (path: string, reason: string | undefined): string =>
    reason === undefined
      ? `Couldn't move ${path} to the trash.`
      : `Couldn't move ${path} to the trash: ${reason.replace(/\.$/, "")}.`,
  couldntPutBack: (path: string): string => `Couldn't put ${path} back`,
  /** The toast after files changed outside Halonic were taken in: the name for one file, the count for a batch. */
  reloaded: (names: readonly string[]): string =>
    names.length === 1
      ? `Reloaded ${names[0]}: changed outside Halonic`
      : `Reloaded ${names.length} files changed outside Halonic`,
  /** The header of the Problems list under the editor; it shows while the list is collapsed. */
  problems: (count: number): string => `Problems (${count})`,
  problemsLabel: "Problems",
  noProblems: "No problems.",
  /** In place of "No problems." for a file too large to be checked. */
  tooLongToCheck: "This file is too long to check.",
  /** One row of the list. */
  problemLine: (line: number, message: string): string => `Line ${line}: ${message}`,
  /** What a screen reader reads for a row, and after F8 moved to a problem. */
  problemRead: (severity: "error" | "warning", line: number, message: string): string =>
    `Line ${line}, ${severity}: ${message.replace(/\.$/, "")}.`,
  /** The line under the list about problems this file's changes cause in other files; the first file follows as a link. */
  problemsElsewhere: (count: number): string =>
    count === 1
      ? "Your edits here cause 1 problem in another file."
      : `Your edits here cause ${count} problems in other files.`,
  /** The toast after a new file is made, with its full path. */
  created: (path: string): string => `New file ${path}`,
} as const;
