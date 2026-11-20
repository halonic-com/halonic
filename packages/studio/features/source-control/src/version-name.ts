import { type ChangeItem, groupIntoItems } from "./change-items.ts";
import type { ChangedFile } from "./changes-list-state.ts";
import { versionWords } from "./changes-words.ts";

/**
 * The name Create version offers, from the items that go in. One item Halonic can describe is
 * named with its sentence, the one its row shows: "Support reply · Step added: Page on-call".
 * Otherwise the name counts what the page counts: "Changes to triage" for one item, "Changes to triage and sorter"
 * for two, "Changes to 4 items" for more. The first version of a workspace is "First version".
 * The person can always change it.
 *
 * @example
 * suggestedVersionName(files, { first: false }); // "Support reply · Step added: Page on-call"
 */
export function suggestedVersionName(
  files: readonly ChangedFile[],
  { first }: { readonly first: boolean },
): string {
  if (first) return versionWords.firstVersion;
  const items = groupIntoItems(files);
  const [only] = items;
  if (items.length === 1 && only !== undefined && saysWhatChanged(only)) {
    return versionWords.nameFromSentence(only.name, only.sentence);
  }
  return versionWords.suggestedName(items.map((item) => item.name));
}

/**
 * Whether the item's sentence says what changed: Halonic described one of its files, or it was
 * renamed. A file Halonic can't describe only has the fallback "Changed", which names nothing.
 */
function saysWhatChanged(item: ChangeItem): boolean {
  return item.files.some((file) => file.description.described || file.from !== undefined);
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
