// The Changes page's words (microcopy revision 94, 16; checklist ux-checklists-t8-t9 part 2,
// 2.1 and 2.10).

/** The page's heading and the states that replace its content. */
export const pageWords = {
  title: "Changes",
  /** The sidebar's Changes, read after its name: "Changes, 3 changes". */
  spokenCount: (count: number) => (count === 1 ? "1 change" : `${count} changes`),
  /** Until the list of changed items is drawn (HAL-1302, next pull request). */
  changedFiles: (count: number) =>
    count === 1
      ? "1 file changed since your last version."
      : `${count} files changed since your last version.`,
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
  checking: "Checking…",
  stillNoGit: "Still can't find git.",
  turningOnHistory: "Turning on history…",
  /** The reason under "Couldn't load changes" for a folder inside a larger repository. */
  nestedRepository: "This folder is part of a larger git repository.",
  nothingChanged: "Nothing has changed since your last version.",
  loading: "Loading changes",
  loadFailed: "Couldn't load changes",
  tryAgain: "Try again",
  /** When git answers without a reason the person can act on. */
  notAnswering: "Git didn't answer. Try again in a moment.",
};
