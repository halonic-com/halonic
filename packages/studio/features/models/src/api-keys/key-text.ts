import type { KeyEntry } from "../api.ts";

/** The words of the key block on a provider's page (flow-models 3.3). */
export const KEY_HEADING = "API key";
export const KEY_SET = "Key set";
export const NO_KEY = "No key";
export const KEY_CHECKING = "Checking for a key";
export const KEY_CHECK_FAILED = "Couldn't check whether a key is stored.";

/**
 * The line when a key action fails; `reason` is the error's words, with the key already removed.
 * `then` is the sentence after it: "Try again.", or what is still true.
 */
function failedLine(what: string, reason: string, then = "Try again."): string {
  const why = reason.trim().replace(/\.$/, "");
  return why === "" ? `Couldn't ${what}. ${then}` : `Couldn't ${what}: ${why}. ${then}`;
}

/** A failed save over a stored key says that key is still the one in use (microcopy 6.3). */
export function saveFailedLine(reason: string, keyStored: boolean): string {
  return failedLine(
    "save the key",
    reason,
    keyStored ? "Your old key is still in use." : undefined,
  );
}

export function removeFailedLine(reason: string): string {
  return failedLine("remove the key", reason);
}
export const NEEDS_SECRET_NAME =
  "Give this provider a secret name above, then you can store its key here.";
export const SAVE_KEY = "Save key";
export const REMOVE_KEY = "Remove key";
export const CHANGE_KEY = "Change key";
export const TRY_AGAIN = "Try again";
export const PASTE_FIRST = "Paste the key first.";
export const REPLACE_PLACEHOLDER = "Paste a new key to replace it";

/** The line after a key is stored. */
export function savedLine(provider: string): string {
  return `Saved key for ${provider}`;
}
export const KEY_REMOVED_LINE = "Key removed";

/** The host command that stores a key from the computer that runs `halonic serve`. */
export function hostCommand(secretName: string): string {
  return `halonic secret set ${secretName}`;
}

/** The question before a stored key is replaced. */
export function changeQuestion(secretName: string): string {
  return `Change ${secretName}? Every agent that uses it switches to the new key right away.`;
}

/** The question before a key is saved while the check for a stored key failed. */
export function saveUnknownQuestion(secretName: string): string {
  return `Save a key as ${secretName}? Studio couldn't check whether one is stored, so this may replace it.`;
}

/** The question before a stored key is removed. */
export function removeQuestion(secretName: string): string {
  return `Remove ${secretName}? Agents that use it can't reach this provider until you store a new key.`;
}

/** Where a key is kept, for the line under the field. */
export function keptLine(entry: Extract<KeyEntry, { kind: "field" }>): string {
  if (entry.keptOn === "this-computer") return "Kept in your system keychain, never in files.";
  return entry.offHostHttps
    ? "The key is kept on the host. It is sent over an encrypted connection."
    : "The key is kept on the host.";
}

/** Why there is no field; `command` is true when the host command follows it. */
export function unavailableLine(reason: Extract<KeyEntry, { kind: "unavailable" }>["reason"]): {
  readonly lead: string;
  readonly command: boolean;
} {
  const run = "On the computer that runs halonic serve, run";
  switch (reason) {
    case "demo":
      return {
        lead: "The demo runs on the built-in test model and keeps no keys. Use the desktop app or halonic serve for real models.",
        command: false,
      };
    case "no-password":
      return {
        lead: `A password is needed for serve to take keys from another device. ${run}`,
        command: true,
      };
    case "unencrypted":
      return {
        lead: `You are not on the computer that runs halonic serve, and this connection is not encrypted, so the key can't be sent from here. ${run}`,
        command: true,
      };
  }
}

/** The words of a key's addresses (HAL-11872, the UX checklist on that task). */
export const ADDRESS_LABEL = "Address";
export const ADDRESS_HINT_BUILT_IN = "Halonic sends this key only to this address.";
export const ADDRESS_HINT_CUSTOM =
  "Enter the address your provider or gateway uses. Halonic sends this key only there.";
export const ADDRESS_PLACEHOLDER = "https://gateway.example.com";
export const ADD_ANOTHER_ADDRESS = "Add another address";
export const NOT_BOUND_YET = "Not bound yet";
export const NOT_BOUND_NOTICE =
  "This key was saved before Halonic recorded addresses, so it has none yet. Enter the address and save to bind it. It keeps working as it does now until you do.";
export const ADDRESSES_UNREADABLE =
  "Can't read the addresses saved for this key. Halonic won't use this key until that is fixed.";
export const ADDRESSES_RECOVERY =
  "Check that your Halonic profile folder can be opened, then reload this page.";
export const ADDRESS_UNENCRYPTED =
  "This address isn't encrypted. Keys sent to it can be read on the way.";
export const ADDRESSES_FULL =
  "This key can't take more addresses. To start again, remove the key and save it with one address.";

/** The error under the Address field, by what is wrong with the typed text. */
export const ADDRESS_PROBLEM = {
  empty: "Enter an address for this key.",
  "not-an-address": "Enter a full address, starting with https:// or http://.",
  "user-info": "Remove the user name and password from the address.",
  scheme: "Use an address that starts with https:// or http://.",
} as const;

/** The line under the field once the typed text reads as an address. */
export function allowedAddressLine(address: string, partDropped: boolean): string {
  const line = `Allowed address: ${address}`;
  return partDropped ? `${line}. Only the address part is kept.` : line;
}

/** The line after a save that kept an address: with a new key, or for the stored one. */
export function addressSavedLine(address: string, withKey: boolean): string {
  return withKey ? `Key saved. Address: ${address}` : `Address saved: ${address}`;
}

/** The button after the first address, and what a screen reader hears for it. */
export function moreAddresses(count: number, secretName: string) {
  return {
    shown: `+${count} more`,
    name: `Show ${count} more ${count === 1 ? "address" : "addresses"} for key ${secretName}`,
  };
}

/** The line above the field on another device over https: encrypted, and the command still works. */
export const OFF_HOST_HTTPS_LEAD =
  "You are not on the computer that runs halonic serve. Or, on that computer, run";
