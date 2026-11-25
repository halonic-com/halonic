import { findSecretShape } from "@halonicjs/std";

/** What `findKeyShapedText` spotted: only the kind, never the text that matched. */
export type KeyShape =
  | NonNullable<ReturnType<typeof findSecretShape>>
  | "private-key"
  | "password-in-address"
  | "random-text";

/** A private key's armour line, such as the one that opens a PEM file. */
const privateKeyLine = /PRIVATE KEY(?: BLOCK)?-----/;

/** A user name and a password before the host in an address. */
const passwordInAddress = /[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]+@/i;

/**
 * A run of 20 or more letters, digits, `+` and `=` with a digit and a
 * capital letter in it: the shape of access keys, tokens and the parts of a
 * signed token. Lower-case hex, such as a commit, has no capital, and
 * names joined with `-`, `_`, `.` or `/` are separate runs, so task ids,
 * branch names and paths don't count. The price: a key made only of lower
 * case and digits, or one split by `-` or `_`, isn't caught here, only by
 * `findSecretShape` when it knows the key's prefix.
 */
const randomRun = /[A-Za-z0-9+=]{20,}/g;

function hasRandomRun(text: string): boolean {
  for (const [run] of text.matchAll(randomRun)) {
    if (/[0-9]/.test(run) && /[A-Z]/.test(run)) return true;
  }
  return false;
}

/**
 * Finds text shaped like a key, token or password, so a brief or a pasted
 * result that holds one is refused before it leaves the user's computer
 * (architecture note on HAL-17491, 7.1; plan on HAL-17834, section 2). It
 * asks `findSecretShape`, the check Studio's chats use, and adds the shapes
 * the leak guard knows that it doesn't: private keys, passwords in
 * addresses and long random text.
 *
 * Never log or show the text when it finds something: the text holds the key.
 *
 * @example
 * findKeyShapedText("Restart the worker on build.acme.example"); // undefined
 * findKeyShapedText(`Use ${"AKIA"}${"Q".repeat(8)}${"7".repeat(8)}`); // "random-text"
 */
export function findKeyShapedText(text: string): KeyShape | undefined {
  const shape = findSecretShape(text);
  if (shape !== undefined) return shape;
  if (privateKeyLine.test(text)) return "private-key";
  if (passwordInAddress.test(text)) return "password-in-address";
  if (hasRandomRun(text)) return "random-text";
  return undefined;
}
