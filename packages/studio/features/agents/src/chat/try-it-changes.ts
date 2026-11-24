/** Why Try it and Test leave a change to review out, until it's accepted (flow-assistant 4.4). */
export type TryItLeftOutReason = "permissions" | "trust-and-sandbox" | "connections" | "models";

/**
 * The assistant's changes to review that Try it and Test read, and the ones they leave out, for
 * one agent or workflow. Every count is of line changes, as Changes counts them.
 */
export interface TryItChanges {
  /** The changes to review in the item's own file that Try it uses. */
  readonly included: number;
  /** The changes left out until accepted, by reason; a reason with none isn't listed. */
  readonly leftOut: readonly { readonly reason: TryItLeftOutReason; readonly changes: number }[];
  /** The changes the assistant made before the workspace was trusted, all left out. */
  readonly beforeTrust: number;
  /** The workspace's name, for the before-trust line. */
  readonly workspaceName: string;
}

/** Nothing to review: no line shows. */
export const noTryItChanges: TryItChanges = {
  included: 0,
  leftOut: [],
  beforeTrust: 0,
  workspaceName: "",
};

/** How each reason reads in "Leaves out 1 change to permissions" (microcopy 14, AI changes 1.5). */
const reasonWords: Record<TryItLeftOutReason, string> = {
  permissions: "permissions",
  "trust-and-sandbox": "sandbox",
  connections: "connections",
  models: "models",
};

const changesWord = (count: number) => (count === 1 ? "1 change" : `${count} changes`);

/** The words of the Try it line (microcopy 14, "Try it with changes to review"). */
export const tryItChangesWords = {
  included: (count: number) =>
    `Includes ${changesWord(count)} from the assistant you haven't accepted yet.`,
  leftOut: (count: number, reason: TryItLeftOutReason) =>
    `Leaves out ${changesWord(count)} to ${reasonWords[reason]} until you accept ${count === 1 ? "it" : "them"}.`,
  beforeTrust: (count: number, workspaceName: string) =>
    `Leaves out ${changesWord(count)} the assistant made before you trusted ${workspaceName}.`,
};

/**
 * The sentences of the Try it line, in order: what it includes, then what it leaves out by
 * reason, then what it leaves out from before trust. None when nothing in the item is left to
 * review, so the line goes.
 */
export function tryItChangesSentences(changes: TryItChanges): readonly string[] {
  const sentences: string[] = [];
  if (changes.included > 0) sentences.push(tryItChangesWords.included(changes.included));
  for (const { reason, changes: count } of changes.leftOut) {
    if (count > 0) sentences.push(tryItChangesWords.leftOut(count, reason));
  }
  if (changes.beforeTrust > 0) {
    sentences.push(tryItChangesWords.beforeTrust(changes.beforeTrust, changes.workspaceName));
  }
  return sentences;
}
