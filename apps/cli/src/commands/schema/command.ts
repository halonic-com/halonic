import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { jsonSchemaOf, kindNames } from "@halonicjs/format";
import { type CliCommand, UsageError } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { shownPath } from "../../shown-path.ts";

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
        `halonic schema takes at most one folder, and you gave ${countWord(input.positionals.length)}: ${input.positionals.map(shownName).join(", ")}.`,
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

/** A name from the command line, in quotes when it's empty or holds a space or a comma, so `""` stays visible in a list. */
function shownName(name: string): string {
  return name === "" || /[\s,]/.test(name) ? `"${name}"` : name;
}

const countWords = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** 2 → "two": a small count as a word, a larger one as digits. */
function countWord(count: number): string {
  return countWords[count] ?? String(count);
}
