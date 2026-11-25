/**
 * The check on what a user pastes back into a browser step's result field
 * (`action-steppers.pasted-result`). The requester writes the field's label and pattern, so a
 * value that looks like a key is refused whatever the pattern says (HAL-17491 7.1 and 7.6): a
 * secret goes only through a secure field, never into the answer.
 */
import { compileResultPattern, findKeyShapedText } from "@halonicjs/action-steppers";

/** What a pasted result is: nothing, a value to keep, or refused and why. */
export type PastedResult =
  | { readonly kind: "empty" }
  | { readonly kind: "kept"; readonly value: string }
  | { readonly kind: "refused"; readonly reason: "key-shaped" | "no-match" };

/**
 * Checks `pasted`, trimmed, against the step's `pattern`. Key shapes are checked first, so a key
 * that happens to match the pattern is still refused. A pattern that doesn't compile matches
 * nothing; the request's review refuses such a pattern before any step runs.
 *
 * @example
 * checkPastedResult(" acme-prod ", "^[a-z][a-z0-9-]{5,29}$"); // { kind: "kept", value: "acme-prod" }
 */
export function checkPastedResult(pasted: string, pattern: string | undefined): PastedResult {
  const value = pasted.trim();
  if (value === "") return { kind: "empty" };
  if (findKeyShapedText(value) !== undefined) return { kind: "refused", reason: "key-shaped" };
  if (pattern !== undefined && !matchesPattern(value, pattern)) {
    return { kind: "refused", reason: "no-match" };
  }
  return { kind: "kept", value };
}

function matchesPattern(value: string, pattern: string): boolean {
  const compiled = compileResultPattern(pattern);
  return compiled.ok && compiled.value.matches(value);
}
