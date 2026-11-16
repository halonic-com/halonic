/** The words of the sample's header chip and its menu (flow-first-run 3.1, microcopy 5). */
export const sampleChipWords = {
  chip: "Sample · test model",
  cost: "Runs on the built-in test model, with scripted replies. No key, no cost.",
  freshCopy: "Fresh copy of the sample",
} as const;

/** The toast after a fresh copy: the new folder's name, and that the old one is still in Recent. */
export function freshCopyLine(name: string, trustFailure?: string): string {
  const sentence = `Created ${name}. Your earlier copy is still in Recent.`;
  return trustFailure === undefined
    ? sentence
    : `${sentence} Couldn't save trust: ${trustFailure.replace(/\.$/, "")}.`;
}
