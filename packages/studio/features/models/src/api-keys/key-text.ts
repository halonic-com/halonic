import type { KeyEntry } from "../api.ts";

/** The words of the key block on a provider's page (flow-models 3.3). */
export const KEY_HEADING = "API key";
export const KEY_SET = "Key set";
export const NO_KEY = "No key";
export const KEY_CHECKING = "Checking for a key";
export const KEY_CHECK_FAILED = "Couldn't check whether a key is stored.";
export const KEY_SAVE_FAILED = "Couldn't save the key. Try again.";
export const KEY_REMOVE_FAILED = "Couldn't remove the key. Try again.";
export const NEEDS_SECRET_NAME =
  "Give this provider a secret name above, then you can store its key here.";
export const SAVE_KEY = "Save key";
export const REMOVE_KEY = "Remove key";
export const CHANGE_KEY = "Change key";
export const KEY_SAVED_LINE = "Key saved";
export const KEY_REMOVED_LINE = "Key removed";

/** The host command that stores a key from the machine that runs `halonic serve`. */
export function hostCommand(secretName: string): string {
  return `halonic secret set ${secretName}`;
}

/** The question before a stored key is replaced. */
export function changeQuestion(secretName: string): string {
  return `Change ${secretName}? Every agent that uses it switches to the new key right away.`;
}

/** The question before a stored key is removed. */
export function removeQuestion(secretName: string): string {
  return `Remove ${secretName}? Agents that use it can't reach this provider until you store a new key.`;
}

/** Where a key is kept, for the line under the field. */
export function keptLine(entry: Extract<KeyEntry, { kind: "field" }>): string {
  if (entry.keptOn === "this-computer") return "The key is kept in the system keychain.";
  return entry.offHostHttps
    ? "The key is kept on the host. It is sent over an encrypted connection."
    : "The key is kept on the host.";
}

/** Why there is no field, and what to do instead. */
export function unavailableLine(
  reason: Extract<KeyEntry, { kind: "unavailable" }>["reason"],
  secretName: string,
): string {
  const command = `On the machine that runs halonic serve, run \`${hostCommand(secretName)}\`.`;
  switch (reason) {
    case "demo":
      return "The demo runs on the built-in test model and keeps no keys. Use the desktop app or halonic serve for real models.";
    case "no-password":
      return `A password is needed for serve to take keys from another device. ${command}`;
    case "unencrypted":
      return `You are not on the machine that runs halonic serve, and this connection is not encrypted, so the key can't be sent from here. ${command}`;
  }
}

/** The line above the field on another device over https: encrypted, and the command still works. */
export function offHostHttpsLine(secretName: string): string {
  return `You are not on the machine that runs halonic serve. Safer: on that machine run \`${hostCommand(secretName)}\`.`;
}
