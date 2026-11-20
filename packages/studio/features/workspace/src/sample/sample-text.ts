/** The words of the demo's header chip and its menu (first-run-flow 8a, microcopy 5). */
export const sampleChipWords = {
  chip: "Sample answers",
  cost: "Runs on the built-in test model, with scripted replies. No key, no cost.",
  freshCopy: "Fresh copy of the demo",
} as const;

/** The sheet the chip opens on a phone, which starts no workspace (flow-first-run 7.2, microcopy 5). */
export const sampleSheetWords = {
  ownWorkspace: "To start your own workspace, use Halonic on your computer.",
} as const;

/** The toast after a fresh copy: the new folder's name, and that the old one is still in Recent. */
export function freshCopyLine(name: string, trustFailure?: string): string {
  const sentence = `Created ${name}. Your earlier copy is still in Recent.`;
  return trustFailure === undefined
    ? sentence
    : `${sentence} Couldn't save trust: ${trustFailure.replace(/\.$/, "")}.`;
}

/** The toast when a fresh copy couldn't be written; the reason ends the line, with a full stop (microcopy 5). */
export function freshCopyFailedLine(reason: string): string {
  return `Couldn't create a fresh copy of the demo: ${reason.replace(/\.$/, "")}.`;
}

/** The toast's button: the same **Try again** every failed action has. */
export const freshCopyTryAgain = "Try again";
