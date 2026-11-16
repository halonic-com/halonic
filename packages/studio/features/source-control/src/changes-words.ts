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
  checking: "Checking…",
  stillNoGit: "Still can't find git.",
  turningOnHistory: "Turning on history…",
  /** The reason under "Couldn't load changes" for a folder inside a larger repository. */
  nestedRepository:
    "This folder is part of a larger git repository. Halonic can't keep versions for it yet.",
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
  /** The toast's Undo, when putting the change back didn't work. */
  undoFailed: "Couldn't put the change back",
  cantUndo: "This change can't be undone on its own.",
  changedMeanwhile: "The file changed while you were looking. Look at the change again.",
};

/** Discard: Undo these changes, and in the developer view Discard and Discard this part. */
export const discardWords = {
  /** The file's button; the developer view says `discard` for the same action. */
  undoTheseChanges: "Undo these changes",
  discard: "Discard",
  discardThisPart: "Discard this part",
  showLines: "Show lines",
  hideLines: "Hide lines",
  /** The line diff's heading, read by a screen reader. */
  lines: (path: string) => `Changed lines in ${path}`,
  /** The toast after a discard: "Discarded changes in 1 file". */
  discarded: (count: number) =>
    count === 1 ? "Discarded changes in 1 file" : `Discarded changes in ${count} files`,
  partDiscarded: "Discarded this part",
  failed: "Couldn't discard these changes",
  partFailed: "Couldn't discard this part",
  /** The toast's Undo, when putting the changes back didn't work. */
  undoFailed: "Couldn't put the changes back",
  cantDiscard: "These changes can't be discarded here.",
  addedOutside:
    "Another program added this file to a version. Discard it there, or create the version here.",
  noCopy: "Halonic couldn't keep a copy, so nothing was discarded.",
};

/** Create version (checklist part 2, 2.6; microcopy revision 94, 16). */
export const versionWords = {
  /** The heading over the changes, with the count beside it. */
  sinceLastVersion: "Since your last version",
  /** The count beside it, with its word so a screen reader says what it counts. */
  itemCount: (count: number) => (count === 1 ? "1 item" : `${count} items`),
  /** The name of an item's checkbox: "Include agents/triage.agent.yaml". */
  include: (path: string) => `Include ${path}`,
  createVersion: "Create version",
  creating: "Creating version…",
  name: "Name",
  notes: "Notes",
  whatsInIt: "What's in it",
  important: "Important",
  before: "Before",
  after: "After",
  /** What a part shows where the item had nothing. */
  notSet: "Not set",
  emptyName: "Give this version a name.",
  failed: "Couldn't create the version",
  tryAgain: "Try again",
  nothingToCreate: "Nothing has changed since your last version.",
  created: (name: string) => `Created version "${name}"`,
  /** The name offered for a version of one or more items. */
  suggestedName: (items: readonly string[]) => {
    const [first, second] = items;
    if (second === undefined) return `Changes to ${first ?? "the workspace"}`;
    if (items.length === 2) return `Changes to ${first} and ${second}`;
    return `Changes to ${items.length} items`;
  },
};

/** Who should versions be from? (checklist part 2, 2.6, T9-F21; microcopy 16, HAL-1566). */
export const identityWords = {
  title: "Who should versions be from?",
  intro: "Your name shows next to each version you create, for you and your team.",
  name: "Name",
  email: "Email",
  emailHint: "Shown in the history. Use a no-reply address if you prefer.",
  saveAndContinue: "Save and continue",
  saving: "Saving…",
  /** Under Name, for an empty field. */
  emptyName: "Enter your name.",
  /** Under Email, for an empty field and for one that isn't an address. */
  badEmail: "Enter an email address, like sam@acme.example.",
  failed: "Couldn't save this",
  tryAgain: "Try again",
};

/** Get updates (checklist part 2, 2.8; microcopy revision 94, 16). */
export const updatesWords = {
  getUpdates: "Get updates",
  gettingUpdates: "Getting updates…",
  /** The toast: "Got 2 versions from the shared copy". One phrase, no full stop. */
  got: (count: number) =>
    count === 1
      ? "Got 1 version from the shared copy"
      : `Got ${count} versions from the shared copy`,
  upToDate: "Already up to date",
  /** The toast's title when nothing could be got; the reason and "Nothing changed here." follow. */
  failed: "Couldn't get versions",
  nothingChanged: "Nothing changed here.",
  /** Both sides have new versions; combining them, item by item, comes with Keep mine and Use theirs. */
  bothMoved:
    "The shared copy and this workspace both have new versions, so they can't be combined here yet.",
  tryAgain: "Try again",
  alreadyWorking: "Halonic is already getting updates.",
};
