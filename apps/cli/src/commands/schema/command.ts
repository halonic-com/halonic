import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { jsonSchemaOf, kindNames } from "@halonicjs/format";
import { type CliCommand, UsageError } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { markPart, phrase, plainText } from "../../messages/phrase.ts";
import { schemaMessages } from "../../messages/schema.ts";
import { shownPath } from "../../shown-path.ts";

/** The folder `halonic schema` writes to when none is given. */
export const defaultSchemaFolder = "schemas";

/** `halonic schema [outDir]`: writes the JSON Schema of every file kind, for editors, docs and other tools. */
export const schemaCommand: CliCommand = {
  name: "schema",
  usage: "[outDir]",
  summary: schemaMessages.summary(),
  action: () => schemaMessages.action(),
  options: {},
  async run(input, io) {
    if (input.positionals.length > 1) {
      throw new UsageError(schemaMessages.tooManyFolders(input.positionals.map(shownName)));
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
    const wrote = schemaMessages.wrote(kinds.length, shownPath(io.cwd, target));
    io.out(plainText(phrase`${markPart("done")} ${wrote.phrase}`));
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
