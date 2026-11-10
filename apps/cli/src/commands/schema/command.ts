import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { jsonSchemaOf, kindNames } from "@halonicjs/format";
import { type CliCommand, UsageError } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { markPart, phrase } from "../../messages/phrase.ts";
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
  async run(input, context) {
    if (input.positionals.length > 1) {
      throw new UsageError(schemaMessages.tooManyFolders(input.positionals.map(shownName)));
    }
    const target = resolve(context.cwd, input.positionals[0] ?? defaultSchemaFolder);
    await mkdir(target, { recursive: true });
    const kinds = kindNames();
    for (const kind of kinds) {
      await writeFile(
        join(target, schemaFileName(kind)),
        `${JSON.stringify(jsonSchemaOf(kind), null, 2)}\n`,
      );
    }
    const files = kinds.map(schemaFileName);
    const folder = shownPath(context.cwd, target);
    const wrote = schemaMessages.wrote(files.length, folder);
    return {
      exitCode: exitCode.ok,
      lines: [phrase`${markPart("done")} ${wrote.phrase}`],
      // The fields the CLI reference lists for `halonic schema --json`.
      json: { folder, files, count: files.length },
    };
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
