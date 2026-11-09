import type { Phrase } from "./phrase.ts";

/** A sentence from the catalogue, with the key it was made from. */
export interface Message {
  /** Where the sentence lives, such as `usage.unknownCommand`: the area, then the entry. */
  readonly key: string;
  /** The words, ready to show. */
  readonly phrase: Phrase;
}

/** One catalogue entry: the facts it needs in, the sentence out. */
// `never` lets an entry take any parameters while the table stays one type.
export type Entry = (...params: never[]) => Phrase;

/** A table of entries, as {@link defineMessages} turns it into messages. */
export type Messages<Table extends Readonly<Record<string, Entry>>> = {
  readonly [Name in keyof Table]: (...params: Parameters<Table[Name]>) => Message;
};

/**
 * Turns one area's sentences into the catalogue entries the CLI prints from.
 * Every sentence the user reads comes from a table made here, so its words
 * live in one place and can change without touching a command.
 *
 * @param area - the first part of each key, such as `usage` or `init`
 * @example
 * const schemaMessages = defineMessages("schema", {
 *   wrote: (count: number, folder: string) => phrase`Wrote ${count} JSON Schemas to ${folder}.`,
 * });
 * schemaMessages.wrote(12, "./schemas"); // { key: "schema.wrote", phrase: [...] }
 */
export function defineMessages<Table extends Readonly<Record<string, Entry>>>(
  area: string,
  table: Table,
): Messages<Table> {
  const entries = Object.entries(table).map(([name, entry]) => [
    name,
    (...params: never[]): Message => ({ key: `${area}.${name}`, phrase: entry(...params) }),
  ]);
  return Object.fromEntries(entries) as Messages<Table>;
}
