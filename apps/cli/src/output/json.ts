import type { CommandResult } from "../command.ts";
import { exitCode } from "../exit-code.ts";

/**
 * The version at the top of every `--json` document (cli-output 1.8). It goes
 * up only when a field changes meaning or goes away; a new field keeps it.
 */
export const outputVersion = 1;

/** The `--json` document of a command that returned a result. */
export interface ResultDocument extends Readonly<Record<string, unknown>> {
  readonly outputVersion: typeof outputVersion;
  readonly ok: boolean;
}

/**
 * A command's result as its one `--json` document: `outputVersion`, `ok`,
 * then the command's own fields. `ok` is true when the command exits with 0.
 */
export function resultDocument(result: CommandResult): ResultDocument {
  return { outputVersion, ok: result.exitCode === exitCode.ok, ...result.json };
}

/**
 * The document with every loaded secret removed from its strings, keys
 * included, at any depth. It works on the values, before `JSON.stringify`
 * escapes them, so a secret that holds a `"` or a `\` is still found.
 */
export function scrubbedDocument<T extends object>(
  document: T,
  scrub: (text: string) => string,
): T {
  return scrubbedValue(document, scrub) as T;
}

function scrubbedValue(value: unknown, scrub: (text: string) => string): unknown {
  if (typeof value === "string") {
    return scrub(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubbedValue(item, scrub));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [scrub(key), scrubbedValue(item, scrub)]),
    );
  }
  return value;
}

/** A document as stdout gets it: indented, so a person can read it too. */
export function jsonText(document: object): string {
  return JSON.stringify(document, null, 2);
}
