import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
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
  takesArguments: true,
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
      await replaceFile(
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

/**
 * Writes `text` to a new file beside `path`, then gives it `path`'s name, so a
 * symbolic or hard link already there is replaced, never written through to
 * the file it leads to (HAL-16336). The new file is made with `wx`, which
 * also follows no link.
 */
async function replaceFile(path: string, text: string): Promise<void> {
  const fresh = `${path}.${randomUUID()}.tmp`;
  await writeFile(fresh, text, { flag: "wx" });
  try {
    await rename(fresh, path);
  } catch (error) {
    await rm(fresh, { force: true });
    throw error;
  }
}

/** `agent` → `agent.schema.json`, the old CLI's file names. */
export function schemaFileName(kind: string): string {
  return `${kind}.schema.json`;
}

/** A name from the command line, in quotes when it's empty or holds a space or a comma, so `""` stays visible in a list. */
function shownName(name: string): string {
  return name === "" || /[\s,]/.test(name) ? `"${name}"` : name;
}
