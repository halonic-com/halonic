import { versionWords } from "./changes-words.ts";

/** The item's name in a path: `agents/triage.agent.yaml` is "triage", `README.md` is "README". */
function itemName(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const dot = fileName.indexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * The name Create version offers: "Changes to triage" for one changed file, "Changes to triage
 * and sorter" for two, "Changes to 4 items" for more. The person can always change it.
 *
 * @example
 * suggestedVersionName(["agents/triage.agent.yaml"]); // "Changes to triage"
 */
export function suggestedVersionName(paths: readonly string[]): string {
  return versionWords.suggestedName([...new Set(paths.map(itemName))]);
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
