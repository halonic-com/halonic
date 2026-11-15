import type { KeyEntry } from "../api.ts";

/** The words of the key block on a provider's page (flow-models 3.3). */
export const KEY_HEADING = "API key";
export const KEY_SET = "Key set";
export const NO_KEY = "No key";
export const KEY_CHECKING = "Checking for a key";
export const KEY_CHECK_FAILED = "Couldn't check whether a key is stored.";

/** The line when a key action fails; `reason` is the error's words, with the key already removed. */
function failedLine(what: string, reason: string): string {
  const why = reason.trim().replace(/\.$/, "");
  return why === "" ? `Couldn't ${what}. Try again.` : `Couldn't ${what}: ${why}. Try again.`;
}

export function saveFailedLine(reason: string): string {
  return failedLine("save the key", reason);
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

/** The line above the field on another device over https: encrypted, and the command still works. */
export const OFF_HOST_HTTPS_LEAD =
  "You are not on the computer that runs halonic serve. Or, on that computer, run";
