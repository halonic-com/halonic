import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";
import { countInWords } from "./words.ts";

/** The sentences of `halonic schema` (cli-output 1.9 and 3.9). */
export const schemaMessages = defineMessages("schema", {
  summary: () => phrase`Write the JSON Schema of every file kind, for editors`,
  action: () => phrase`write the schemas`,
  wrote: (count: number, folder: string) => phrase`Wrote ${count} JSON Schemas to ${folder}.`,
  tooManyFolders: (folders: readonly string[]) =>
    phrase`halonic schema takes at most one folder, and you gave ${countInWords(folders.length)}: ${folders.join(", ")}.`,
});
