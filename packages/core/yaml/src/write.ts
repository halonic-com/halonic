import { assert } from "@halonicjs/std";
import { stringify } from "yaml";

/** The line width the old app wrote workspace files with. */
const fileLineWidth = 100;

/**
 * Writes data as a workspace YAML file, with exactly the text the old app
 * wrote (`stringify(value, { lineWidth: 100 })` in 784f78d), so the first
 * save in the new Studio doesn't rewrite every file.
 *
 * It writes what it is given: dropping empty values first is up to the caller.
 *
 * @param value - plain data: objects, arrays, strings, numbers, booleans, `null`
 * @returns the YAML text, ending in a newline
 * @throws AssertionError when `value` has no YAML form, such as `undefined`
 *
 * @example
 * writeYamlFile({ name: "Billing", enabled: "yes" });
 * // 'name: Billing\nenabled: "yes"\n'
 */
export function writeYamlFile(value: unknown): string {
  return stringifyOrThrow(value, { lineWidth: fileLineWidth });
}

/** The two fields the old app wrote into the front matter of a `SKILL.md`. */
export interface FrontMatterFields {
  readonly name: string;
  readonly description: string;
}

/**
 * Writes the fields of a Markdown front matter block, with exactly the text
 * the old app wrote for `SKILL.md` (`stringify(fields).trim()` in 784f78d:
 * the default line width of 80, no trailing newline). Adding the `---` lines
 * around it is up to the caller.
 *
 * @param fields - the front matter fields
 * @returns the YAML text, without a trailing newline
 *
 * @example
 * writeFrontMatter({ name: "invoice-style", description: "How invoices read" });
 * // 'name: invoice-style\ndescription: How invoices read'
 */
export function writeFrontMatter(fields: FrontMatterFields): string {
  return stringifyOrThrow(fields).trim();
}

function stringifyOrThrow(value: unknown, options?: { readonly lineWidth: number }): string {
  // `stringify` returns undefined, not text, for undefined and functions.
  const text: string | undefined = stringify(value, options);
  assert(text !== undefined, `Expected data that YAML can hold, but got ${typeof value}.`);
  return text;
}
