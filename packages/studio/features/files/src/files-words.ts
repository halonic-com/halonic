/** The words the file tree shows (microcopy for the Files frames). */
export const filesWords = {
  treeLabel: "Files",
  loading: "Loading files",
  emptyTitle: "No files yet",
  emptyDescription: "Files you add to this workspace show here.",
  errorTitle: "Couldn't load files",
  retry: "Try again",
  retrying: "Checking…",
  /** The screen-reader name of an error count on a row. */
  errors: (count: number): string => `${count} ${count === 1 ? "error" : "errors"}`,
  warnings: (count: number): string => `${count} ${count === 1 ? "warning" : "warnings"}`,
  /** The "not saved" mark on a file, or on a folder with such a file in it. */
  outside: "Changed outside Halonic",
  /** The kind of a file's tab, as a screen reader reads it after the name. */
  fileKind: "file",
  fileLoading: "Loading the file",
  /** The editor's name for a screen reader: the file's path. */
  editorLabel: (path: string): string => `Text of ${path}`,
  missingTitle: "This file isn't here any more",
  missingDescription: "It was moved or deleted. Pick another file in the tree.",
  unreadableTitle: "Couldn't open this file",
  /** The strip above the editor of a file with unsaved changes that changed outside Halonic. */
  changedOutside: (name: string): string => `${name} changed outside Halonic`,
  deletedOutside: (name: string): string => `${name} was deleted outside Halonic.`,
  compare: "Compare",
  keepMine: "Keep mine",
  useOther: "Use the other one",
  combineBoth: "Combine both",
  close: "Close",
  cancel: "Cancel",
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
  pathPrivate: (path: string): string => `"${path}" is not part of the workspace definitions`,
  renameTitle: "Rename file",
  renamePath: "New path",
  renameConfirm: "Rename",
  renaming: "Renaming…",
  /** Under the Rename field when the path is the file's own. */
  renameSame: "That is the file's own path.",
  /** Under the Rename field when another file has the path. */
  renameTaken: (path: string): string => `${path} already exists.`,
  /** The line of the Rename dialog about files that name this one. */
  alsoUpdates: (count: number): string =>
    `Also updates ${count} ${count === 1 ? "place" : "places"}`,
  /** The toast after a rename, with the new path. */
  renamed: (path: string): string => `Renamed to ${path}`,
  /** The toast after a delete: with a second line it is a sentence and ends with a full stop. */
  deleted: (name: string, withLine: boolean): string =>
    `Moved ${name} to the trash${withLine ? "." : ""}`,
  /** The second line of that toast when other files name the deleted one by its id. */
  deletedPlaces: (count: number): string =>
    count === 1
      ? "1 place now shows an error until you update it."
      : `${count} places now show an error until you update them.`,
  undo: "Undo",
  tryAgain: "Try again",
  couldntDelete: (name: string, reason: string | undefined): string =>
    reason === undefined
      ? `Couldn't move ${name} to the trash.`
      : `Couldn't move ${name} to the trash: ${reason.replace(/\.$/, "")}.`,
  couldntPutBack: (name: string): string => `Couldn't put ${name} back`,
  /** The toast after files changed outside Halonic were taken in: the name for one file, the count for a batch. */
  reloaded: (names: readonly string[]): string =>
    names.length === 1
      ? `Reloaded ${names[0]}: changed outside Halonic`
      : `Reloaded ${names.length} files changed outside Halonic`,
  /** The toast after a new file is made, with its full path. */
  created: (path: string): string => `New file ${path}`,
} as const;
