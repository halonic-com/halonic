// The Changes page's words (microcopy revision 94, 16; checklist ux-checklists-t8-t9 part 2,
// 2.1 and 2.10).

/** The page's heading and the states that replace its content. */
export const pageWords = {
  title: "Changes",
  /** The What changed page's way back to the list. */
  back: "Back to Changes",
  /** The page's other button: "Open workflow", "Open agent". */
  openItem: (kind: string) => `Open ${kind}`,
  /** The sidebar's Changes, read after its name: "Changes, 3 changes". */
  spokenCount: (count: number) => (count === 1 ? "1 change" : `${count} changes`),
};

/** What the page says when there is nothing to list. */
export const stateWords = {
  notARepositoryTitle: "Keep a history of your work",
  notARepositoryBody: "Keep versions of this workspace so you can see what changed.",
  turnOnHistory: "Turn on history",
  /** Under "Keep a history of your work": what a folder without history means for saving (save model 2.8). */
  historyIsOff: "History is off. Everything you save is used right away.",
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

/** Where the phone's words differ: git runs on the person's computer, not on the phone (552 5.7). */
export const phoneWords = {
  noGitTitle: "Halonic needs git on your computer to keep versions.",
  notAnswering: "Halonic on your computer isn't answering.",
  /** The sharing strip: a share address is set on the computer, so a phone can't add one (552 5.4). */
  onlyHere: "Only on your computer.",
  addOnComputer: "Add where to share on a computer.",
};

/** The list of changes and Undo this change (checklist part 2, 2.3). */
export const listWords = {
  important: "Important",
  other: "Other changes",
  undoThisChange: "Undo this change",
  /** Why Undo this change is unavailable: another change in the file builds on this one. */
  undoThatFirst: (sentence: string) => `${sentence} uses this. Undo that change first.`,
};

/** The items of the list and the files that are no item (checklist part 2, 2.2). */
export const itemWords = {
  /** The heading of the files no kind places, shown by their friendly names. */
  otherFiles: "Other files",
  workspaceSettings: "Workspace settings",
  models: "Models",
  /** The small word before a row's sentence: "Workflow · New". */
  kind: {
    agent: "Agent",
    workflow: "Workflow",
    workflowTest: "Workflow test",
    routine: "Routine",
    skill: "Skill",
    hub: "Hub",
    provider: "Provider",
    runtime: "Runtime",
    knowledge: "Knowledge",
    collection: "Collection",
    connector: "Connector",
    integration: "Integration",
    plugin: "Plugin",
    workspace: "Workspace settings",
    deployments: "Deployments",
    models: "Models",
  } as const,
  /** A row's second line: its kind word, then what changed. */
  kindAndSentence: (kind: string, sentence: string) =>
    sentence === "" ? kind : `${kind} · ${sentence}`,
  /** Over a new item's fields on its What changed page: "New skill". */
  newOfKind: (kind: string) => `New ${kind.toLowerCase()}`,
  /** Create version's sentence after the kind in an item's checkbox: "· New". */
  sentenceAfterKind: (sentence: string) => `· ${sentence}`,
  /** `.gitignore`: the file Halonic writes when history is turned on. */
  historyLeavesOut: "Files history leaves out",
  /** The sentence of an item that moved: "Renamed from Support". */
  renamedFrom: (name: string) => `Renamed from ${name}`,
  /** The row's ⋮, named by its item so a screen reader says which row it is on. */
  moreActionsFor: (name: string) => `More actions for ${name}`,
  /** The ⋮'s first entry. */
  openNamed: (name: string) => `Open ${name}`,
  /** Under the last row when more items changed than the list draws. */
  andMore: (count: number) => `and ${count} more`,
};

/** A change's parts in words (checklist part 2, 2.4): a neutral label, then the value before and after. */
export const partChangeWords = {
  changed: "CHANGED",
  added: "ADDED",
  removed: "REMOVED",
  /** Read before the old and the new value, since the strike-through is not a word. */
  before: "Before:",
  after: "After:",
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
  /** The phone's bottom bar while Undo these changes runs. */
  undoingTheseChanges: "Undoing…",
  discard: "Discard",
  discardThisPart: "Discard this part",
  /** The disclosure that opens the line diff of a file. */
  advanced: "Advanced",
  /** Said once for a file whose change Halonic can't put in words. */
  cantDescribe: "Halonic can't describe this change.",
  /** The label beside that file's name, by what happened to it. */
  fileLabel: { changed: "CHANGED", new: "NEW", deleted: "DELETED" },
  /** The line diff's heading, read by a screen reader. */
  lines: (path: string) => `Changed lines in ${path}`,
  /** The toast after Undo these changes: "Undid changes to Sorter." */
  undid: (name: string) => `Undid changes to ${name}.`,
  /** The toast after the developer view's Discard of one file; the path follows. */
  fileDiscarded: "Discarded this file",
  /** The toast's link: puts back what the toast says was discarded. */
  undo: "Undo",
  /** A new item's whole file under Advanced, read by a screen reader. */
  wholeFile: (path: string) => `The whole of ${path}`,
  /** Over the first lines of a new file, read by a screen reader. */
  firstLines: (path: string) => `First lines of ${path}`,
  /** A part's heading: "Line 12" or "Lines 12 to 18"; `first` and `last` count from 1. */
  partLines: (first: number, last: number) =>
    first === last ? `Line ${first}` : `Lines ${first} to ${last}`,
  /** Read before a line of a part, since its + or − glyph and its tint are not words. */
  addedLine: "Added line:",
  removedLine: "Removed line:",
  partDiscarded: "Discarded this part",
  failed: "Couldn't discard these changes",
  partFailed: "Couldn't discard this part",
  /** The toast's Undo, when putting the changes back didn't work. */
  undoFailed: "Couldn't put the changes back",
  cantDiscard: "These changes can't be discarded here.",
  /** The file is staged by another program, not yet in a version (HAL-12642). */
  addedOutside:
    "Another program got this file ready for a version. Undo it there, or create the version here.",
  noCopy: "Halonic couldn't keep a copy, so nothing was discarded.",
  /** The one question Undo these changes ever asks: when no copy can be kept (checklist 2.5). */
  noCopyTitle: (name: string) => `Undo changes to ${name}?`,
  noCopyBody: "Halonic couldn't keep a copy, so this can't be undone.",
  noCopyConfirm: "Undo changes",
  noCopyBusy: "Undoing…",
  /** The Callout when an item's undo failed and the roll-back failed too (checklist 2.5). */
  partialTitle: (name: string) => `Couldn't undo all changes to ${name}`,
  partialBody: (reason: string) => `${reason} Halonic couldn't put these files back as they were.`,
  tryAgain: "Try again",
  tryAgainBusy: "Undoing…",
};

/** Create version (checklist part 2, 2.6; microcopy revision 94, 16). */
export const versionWords = {
  /** The heading over the changes, with the count beside it. */
  sinceLastVersion: "Since your last version",
  /** The count beside it, with its word so a screen reader says what it counts. */
  itemCount: (count: number) => (count === 1 ? "1 item" : `${count} items`),
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
  /** The box under What's in it, shown only when a share address is set. */
  shareRightAway: "Share with your team right away",
  shareRightAwayCaption:
    "Your team can get it straight away. Sharing can't be taken back, but you can share a newer version.",
  createdAndShared: (name: string) => `Created and shared version "${name}"`,
  /** After "Couldn't share" and the reason, when the version was created but not shared. */
  savedHere: "Your version is saved here.",
  /** Under the list of the first version: Halonic made the file, not the person. */
  addedByHistory: "Halonic added this when you turned on history.",
  /** The name offered for the first version of a workspace. */
  firstVersion: "First version",
  /**
   * The name offered for a version of one item Halonic can describe, with its row's sentence:
   * "Support reply · Step added: Page on-call".
   */
  nameFromSentence: (item: string, sentence: string) => `${item} · ${sentence}`,
  /** The name offered for a version of one or more items, when no sentence says what changed. */
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
  emailHint: "Saved with each version. Use a no-reply address if you prefer.",
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
  /** Shown only when one side is ahead and the shared copy moved during the get; both moved goes to merging (HAL-12642). */
  bothMoved:
    "The shared copy or this workspace got a new version while Halonic was getting updates.",
  tryAgain: "Try again",
  alreadyWorking: "Halonic is already getting updates.",
};

/** Choosing per item when both sides changed (checklist part 2, 2.8; microcopy revision 94, 16). */
export const mergeWords = {
  /** Whose updates: "Sam's" for one person, "the shared" for more (the tile says "the shared one"). */
  whose: (people: readonly string[]) =>
    people.length === 1 && people[0] !== undefined ? `${people[0]}'s` : "the shared",
  /** The other side's name for the page: "Sam", or "the team" when more than one person's versions came. */
  who: (people: readonly string[]) =>
    people.length === 1 && people[0] !== undefined ? people[0] : "the team",
  /** "Sam's" or "The shared one", the start of "…: not used". */
  theirsName: (people: readonly string[]) =>
    people.length === 1 && people[0] !== undefined ? `${people[0]}'s` : "The shared one",
  heading: "Getting updates",
  /** No History sentence when nothing overlaps: nothing of yours is replaced (HAL-13042). */
  intro: (people: readonly string[], count: number) =>
    count === 0
      ? `You and ${mergeWords.who(people)} changed different items, so there's nothing to choose. Finish getting updates to bring theirs in.`
      : `You and ${mergeWords.who(people)} both changed ${count === 1 ? "1 item" : `${count} items`}. Choose which one to keep. Your version is kept in History either way.`,
  /** The strip over the page while a merge is left open. */
  inTheMiddle: (people: readonly string[]) =>
    `You're in the middle of getting ${mergeWords.whose(people)} updates.`,
  continue: "Continue",
  yours: "Yours",
  keepMine: "Keep mine",
  useTheirs: (people: readonly string[]) =>
    people.length === 1 && people[0] !== undefined ? `Use ${people[0]}'s` : "Use the shared one",
  keepBoth: "Keep both",
  keepingYours: "Keeping yours",
  keepingTheirs: (people: readonly string[]) =>
    people.length === 1 && people[0] !== undefined
      ? `Keeping ${people[0]}'s`
      : "Keeping the shared one",
  keepingBoth: "Keeping both",
  notUsed: (people: readonly string[]) => `${mergeWords.theirsName(people)}: not used`,
  /** Under "Keeping both": where the other side's copy went. */
  copySavedAs: (path: string) => `Saved next to yours as ${path}.`,
  undo: "Undo",
  /** What a tile shows for a side that deleted the item. */
  deleted: "Deleted",
  /** A side's text, cut after a few lines. */
  moreLines: (count: number) => (count === 1 ? "1 more line" : `${count} more lines`),
  finish: "Finish getting updates",
  /** Finish's visible description until every item is chosen. */
  chooseForMore: (count: number) =>
    count === 1 ? "Choose for 1 more item." : `Choose for ${count} more items.`,
  cancel: "Cancel getting updates",
  working: "Working…",
  /** The message of the version that completes the merge. */
  merged: (people: readonly string[]) => `Merged ${mergeWords.whose(people)} updates`,
  cancelled: "Cancelled getting updates",
  /** The reason under Create version and Get updates, and the tooltip and description of what waits. */
  finishFirst: "Finish getting updates first.",
  /** A choice that didn't work; the reason follows. */
  choiceFailed: "Couldn't make that choice",
  finishFailed: "Couldn't finish getting updates",
  cancelFailed: "Couldn't cancel getting updates",
};

/** History (checklist part 2, 2.9 and 2.10; microcopy revision 94, 16). */
export const historyWords = {
  title: "History",
  loading: "Loading history",
  loadFailed: "Couldn't load history",
  tryAgain: "Try again",
  noVersions: "No versions yet.",
  showMore: "Show more",
  /** On a phone the newest few show first; this row shows the rest (552 5.1). */
  seeAll: "See all history",
  /** On a phone, the chip on a version the shared copy lacks (611 3). */
  notShared: "Not shared yet",
  today: "Today",
  yesterday: "Yesterday",
  /** The name of the box that shows the picked version. */
  detailsLabel: (name: string) => `Version "${name}"`,
  whatsInIt: "What's in it",
  noFiles: "No workspace files changed.",
};

/** Restore just this, on an item of a version (checklist part 2, 2.9; 552 5.5). */
export const restoreWords = {
  restoreJustThis: "Restore just this",
  /** The toast, with Undo: "Restored Sorter from "Sorter replies in Dutch"." */
  restored: (item: string, version: string) => `Restored ${item} from "${version}".`,
  /** The danger toast when nothing was restored. */
  failed: (item: string) => `Couldn't restore ${item}`,
  undo: "Undo",
  /** The toast's Undo, when putting the files back didn't work. */
  undoFailed: "Couldn't put the files back",
  /** The Callout when a file failed and putting the others back failed too. */
  partialTitle: (item: string, version: string) => `Restored part of ${item} from "${version}".`,
  partialBody: (count: number, reason: string) =>
    `${count === 1 ? "Couldn't change 1 file" : `Couldn't change ${count} files`}: ${reason}`,
  changedMeanwhile: "A file changed while Halonic was restoring it.",
  changedSince: "A file changed after it was restored.",
  noCopy: "Halonic couldn't keep a copy of your changes, so nothing was restored.",
  cantRead: "Halonic couldn't read this version.",
  tryAgain: "Try again",
  tryAgainBusy: "Restoring…",
};

/** Go back, on a version (checklist part 2, 2.9 and 2.14; 552 5.5). */
export const goBackWords = {
  goBack: "Go back to this version",
  goingBack: "Going back…",
  /** The version that first keeps the changes not in a version yet. */
  beforeGoingBack: "Before going back",
  /** The toast, with Undo: "Went back to "Sorter replies in Dutch"." */
  wentBack: (version: string) => `Went back to "${version}".`,
  /** The danger toast when nothing went back. */
  failed: (version: string) => `Couldn't go back to "${version}"`,
  /** The Callout when a file failed and putting the others back failed too. */
  partialTitle: (version: string) => `Went back only partly to "${version}".`,
  /** Before Go back, when versions after this one are shared already. */
  sharedAfter:
    "Your team keeps the versions you shared after this one. Going back makes a new change you can share.",
};

/** The sharing strip and Add where to share (checklist part 2, 2.3; microcopy 16, HAL-1566). */
export const shareWords = {
  onlyHere: "Only on this computer",
  addWhereToShare: "Add where to share",
  adding: "Adding…",
  intro: "Your team gets your versions from this git address, and you get theirs.",
  addressLabel: "Git address",
  addressHint: "Copy it from the Clone button on GitHub, GitLab or your own git server.",
  add: "Add",
  /** Under Git address, for an empty field or an address that isn't one of the three forms. */
  badAddress:
    "Enter a git address, like https://github.com/acme/agents.git or git@github.com:acme/agents.git.",
  failed: "Couldn't add this address",
  tryAgain: "Try again",
  /** The strip: "1 version isn't shared yet", "3 versions aren't shared yet". */
  notShared: (count: number) =>
    count === 1 ? "1 version isn't shared yet" : `${count} versions aren't shared yet`,
  /** The button: "Share 1 version", "Share 3 versions". */
  share: (count: number) => (count === 1 ? "Share 1 version" : `Share ${count} versions`),
  sharing: "Sharing…",
  /** The toast: "Shared 3 versions". One phrase, no full stop. */
  shared: (count: number) => (count === 1 ? "Shared 1 version" : `Shared ${count} versions`),
  /** The toast's title when sharing failed; the reason and "Nothing was sent." follow. */
  shareFailed: "Couldn't share",
  nothingSent: "Nothing was sent.",
  /** The strip when everything is shared and nothing is waiting. */
  upToDate: "Shared with your team. Up to date.",
  /** The strip when the shared copy couldn't be asked; the reason is a sentence. */
  couldntCheck: (reason: string) => `Couldn't check for updates: ${reason}`,
};
