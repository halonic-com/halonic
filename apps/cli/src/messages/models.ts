import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/**
 * The sentences of `halonic models allow-address`. A key's value is never in
 * a sentence: only its name and the address, as they are stored. The words
 * follow the UX checklist on HAL-11873: "address", "key" and "provider", and
 * never "origin", "host" or "URL".
 */
export const modelsMessages = defineMessages("models", {
  summary: () => phrase`Say where a provider may send a stored key`,
  allowAddressSummary: () => phrase`Allow a provider to send a stored key to an address`,
  allowAddressUsage: () => phrase`halonic models allow-address <key-name> <address>`,
  needsKeyAndAddress: () => phrase`halonic models allow-address needs a key name and an address.`,

  allowed: (address: string, key: string) =>
    phrase`${markPart("done")} Allowed ${address} for key "${key}".`,
  alreadyAllowed: (address: string, key: string) =>
    phrase`${address} is already allowed for key "${key}". Nothing changed.`,
  /** A path, query or fragment after the address is dropped, not refused. */
  onlyAddressKept: (address: string) => phrase`Only the address part is kept: ${address}.`,

  /** `keyWord` is the key as one shell word, so the command can be copied and run. */
  noKey: (key: string, keyWord: string) =>
    phrase`There's no key named "${key}". Save it with halonic secret set ${keyWord} or on the Models page first.`,
  notAnAddress: (typed: string) =>
    phrase`"${typed}" isn't an address. Use one that starts with https:// or http://, for example https://gateway.example.com.`,
  addressHasUserInfo: () => phrase`Remove the user name and password from the address.`,
  tooManyAddresses: (key: string, most: number) =>
    phrase`Key "${key}" is already allowed for ${most} addresses, the most it can have. Nothing changed.`,
  /** The profile's secrets file couldn't be read or written; nothing was changed. */
  cantReadAddresses: () =>
    phrase`Couldn't read the addresses saved for this key. Nothing was changed. Check that your Halonic profile folder can be opened and try again.`,

  /** Run from inside a run, where a tool must not give a key a new address. */
  insideRun: () => phrase`This command can't be run from inside a run.`,
  insideRunFix: () => phrase`Run it in your own terminal, or use the Models page.`,
});
