import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { jsonSchemaOf, kindNames } from "@halonicjs/format";
import { type CliCommand, UsageError } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";

/** The folder `halonic schema` writes to when none is given. */
export const defaultSchemaFolder = "schemas";

/** `halonic schema [outDir]`: writes the JSON Schema of every file kind, for editors, docs and other tools. */
export const schemaCommand: CliCommand = {
  name: "schema",
  usage: "[outDir]",
  summary: "Write the JSON Schema of every file kind, for editors",
  options: {},
  async run(input, io) {
    if (input.positionals.length > 1) {
      throw new UsageError(
        `halonic schema takes at most one folder, and you gave ${countWord(input.positionals.length)}: ${input.positionals.join(", ")}.`,
      );
    }
    const folder = input.positionals[0] ?? defaultSchemaFolder;
    const target = resolve(io.cwd, folder);
    await mkdir(target, { recursive: true });
    const kinds = kindNames();
    for (const kind of kinds) {
      await writeFile(
        join(target, schemaFileName(kind)),
        `${JSON.stringify(jsonSchemaOf(kind), null, 2)}\n`,
      );
    }
    io.out(`✓ Wrote ${kinds.length} JSON Schemas to ${shownPath(io.cwd, target)}.`);
    return exitCode.ok;
  },
};

/** `agent` → `agent.schema.json`, the old CLI's file names. */
export function schemaFileName(kind: string): string {
  return `${kind}.schema.json`;
}

/**
 * A folder as the user would type it from where they are (cli-output 1.2):
 * `./schemas` for a folder below, `../out` for one above, and the full path
 * when it's on another drive.
 */
export function shownPath(cwd: string, target: string): string {
  const path = relative(cwd, target);
  if (path === "") {
    return ".";
  }
  if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) {
    return path;
  }
  return `.${sep}${path}`;
}

const countWords = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** 2 → "two": a small count as a word, a larger one as digits. */
function countWord(count: number): string {
  return countWords[count] ?? String(count);
}
