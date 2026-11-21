// The words of "Allow this address?" (HAL-11873 UX checklist, "Prompt in
// Studio"). A person reads only "address", "key" and "provider" (X-1).

/** The dialog's fixed words. */
export const allowAddressWords = {
  title: "Allow this address?",
  warning: "Only allow an address you recognise. Halonic will send the key there on every request.",
  scope: "Allowing it applies to this key only.",
  noAddressYet: "This key has no address yet.",
  allow: "Allow this address",
  saving: "Saving…",
  refuse: "Don't allow",
  saveFailed:
    "Couldn't save this address. The key was not sent. Try again, or add the address on the Models page.",
} as const;

/** The title, with "(1 of 2)" only when more questions are waiting. */
export function allowAddressTitle(position: number, count: number): string {
  return count > 1
    ? `${allowAddressWords.title} (${position} of ${count})`
    : allowAddressWords.title;
}

/** The context line's start, before the addresses: "This key is currently allowed for". */
export const currentlyAllowedFor = "This key is currently allowed for";
