import type { Identity } from "./api.ts";

/** The longest name or email the shell accepts. */
const longest = 254;

/**
 * Whether `text` is a name the shell accepts for a version's author: one line, no longer than
 * {@link longest}, and not starting with `-`, which git would read as an option. The shell checks
 * the same rules again before git starts (`config user.name`).
 */
export function isAuthorName(text: string): boolean {
  return isOneLine(text) && text !== "";
}

/**
 * Whether `text` looks like an email address: something, `@`, something, with no spaces. Only the
 * shape is checked; no one is asked whether it exists.
 *
 * @example
 * isAuthorEmail("sam@acme.example"); // true
 * isAuthorEmail("sam"); // false
 */
export function isAuthorEmail(text: string): boolean {
  return isOneLine(text) && /^[^\s@]+@[^\s@]+$/.test(text);
}

/** Whether a name and email are both set. */
export function isIdentityComplete(identity: Identity): boolean {
  return identity.name.trim() !== "" && identity.email.trim() !== "";
}

function isOneLine(text: string): boolean {
  return (
    text.trim() !== "" &&
    text.length <= longest &&
    !text.startsWith("-") &&
    ![...text].some((character) => character < " " || character === "\u007f")
  );
}
