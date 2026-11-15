// The Changes page's words (microcopy revision 94, 16; checklist ux-checklists-t8-t9 part 2,
// 2.1 and 2.10).

/** The page's heading and the states that replace its content. */
export const pageWords = {
  title: "Changes",
  /** The sidebar's Changes, read after its name: "Changes, 3 changes". */
  spokenCount: (count: number) => (count === 1 ? "1 change" : `${count} changes`),
};

/** What the page says when there is nothing to list. */
export const stateWords = {
  notARepositoryTitle: "Keep a history of your work",
  notARepositoryBody:
    "Halonic saves versions of this workspace so you can see what changed and go back.",
  turnOnHistory: "Turn on history",
  turnOnFailed: "Couldn't turn on history",
  noGitTitle: "Halonic needs git to keep versions.",
  installGit: "How to install git",
  installGitAddress: "https://git-scm.com/downloads",
  checkAgain: "Check again",
  nothingChanged: "Nothing has changed since your last version.",
  loading: "Loading changes",
  loadFailed: "Couldn't load changes",
  tryAgain: "Try again",
  /** When git answers without a reason the person can act on. */
  notAnswering: "Git didn't answer. Try again in a moment.",
};

/** The list of changes and Undo this change (checklist part 2, 2.3). */
export const listWords = {
  important: "Important",
  other: "Other changes",
  undoThisChange: "Undo this change",
  /** Why Undo this change is unavailable: another change in the file builds on this one. */
  undoThatFirst: (sentence: string) => `${sentence} uses this. Undo that change first.`,
};

/** What Undo this change says when it is done or can't be done. */
export const undoWords = {
  undone: "Change undone",
  undo: "Undo",
  failed: "Couldn't undo this change",
  cantUndo: "This change can't be undone on its own.",
  changedMeanwhile: "The file changed while you were looking. Look at the change again.",
};
