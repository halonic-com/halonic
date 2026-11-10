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

/** A document as stdout gets it: indented, so a person can read it too. */
export function jsonText(document: object): string {
  return JSON.stringify(document, null, 2);
}
