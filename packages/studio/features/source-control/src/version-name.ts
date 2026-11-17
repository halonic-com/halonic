import { groupIntoItems } from "./change-items.ts";
import type { ChangedFile } from "./changes-list-state.ts";
import { versionWords } from "./changes-words.ts";

/**
 * The name Create version offers, from the items the page lists: "Changes to triage" for one,
 * "Changes to triage and sorter" for two, "Changes to 4 items" for more, so it counts what the
 * page counts. The first version of a workspace is "First version". The person can always
 * change it.
 *
 * @example
 * suggestedVersionName(files, { first: false }); // "Changes to triage"
 */
export function suggestedVersionName(
  files: readonly ChangedFile[],
  { first }: { readonly first: boolean },
): string {
  if (first) return versionWords.firstVersion;
  return versionWords.suggestedName(groupIntoItems(files).map((item) => item.name));
}

/**
 * The message git records: the name, then the notes after an empty line. Newlines in the name
 * become spaces, so the name stays the first line.
 */
export function versionMessage(name: string, notes: string): string {
  const title = name.replace(/\s+/g, " ").trim();
  const body = notes.trim();
  return body === "" ? title : `${title}\n\n${body}`;
}
