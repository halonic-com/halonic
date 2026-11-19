import { fileKinds, type KindName, parseFile } from "@halonicjs/format";
import { placeOf } from "@halonicjs/workspace";
import { readYaml } from "@halonicjs/yaml";
import { AGENT_FIELDS } from "./describe-agent.ts";
import { fieldOf, keysInOrder, nameFromId } from "./describe-fields.ts";
import { ROUTINE_FIELDS } from "./describe-routine.ts";
import { WORKFLOW_FIELDS } from "./describe-workflow.ts";

/** One field of a new item: its key, its label as an edited item's line names it, and its value. */
export interface ItemField {
  readonly key: string;
  readonly label: string;
  readonly value: unknown;
}

/** A skill's fields, named as the Library's skill page names them. */
const SKILL_FIELDS: Readonly<Record<string, string>> = {
  name: "Name",
  description: "When to use it",
  body: "Instructions",
};

/** The labels of each kind's fields; a field without one is named from its key. */
const FIELD_LABELS: { readonly [Name in KindName]?: Readonly<Record<string, string>> } = {
  agent: AGENT_FIELDS,
  workflow: WORKFLOW_FIELDS,
  routine: ROUTINE_FIELDS,
  skill: SKILL_FIELDS,
};

/** The id is the file's own name, so it says nothing the item's page doesn't. */
const PLACE_FIELDS: ReadonlySet<string> = new Set(["id"]);

/**
 * The fields of an item that is new, for the Changes page to show it the way it shows an edited
 * item: each with the label an edited item's line gives it, in the same order. Only the fields
 * the text sets are given, not the defaults the kind fills in, and never the id. `undefined` when
 * no kind places the file or its text doesn't read as the kind, so the caller shows the file as
 * it is instead.
 *
 * @param path - the file's path in the workspace, "/" separated
 * @param text - the new file's text
 *
 * @example
 * newItemFields("library/skills/refunds/SKILL.md", "---\nname: Refunds\ndescription: For refunds.\n---\nCheck the order.\n");
 * // [{ key: "name", label: "Name", value: "Refunds" }, { key: "description", label: "When to use it", … }, { key: "body", label: "Instructions", … }]
 */
export function newItemFields(path: string, text: string): ItemField[] | undefined {
  const place = placeOf(path);
  if (place === undefined) return undefined;
  const id = place.placeId;
  const parsed = parseFile(place.kind, text, id === undefined ? {} : { id });
  if (!parsed.ok) return undefined;
  const item: unknown = parsed.value.value;
  if (typeof item !== "object" || item === null) return undefined;
  const labels = FIELD_LABELS[place.kind] ?? {};
  const written = writtenKeys(place.kind, text);
  return keysInOrder(labels, item)
    .filter((key) => !PLACE_FIELDS.has(key) && written(key) && isSet(fieldOf(item, key)))
    .map((key) => ({ key, label: labels[key] ?? nameFromId(key), value: fieldOf(item, key) }));
}

/**
 * Whether the text itself sets a top-level key, read with the kind's old key names as new ones.
 * A Markdown file's fields are its front matter and its body, all of which the kind keeps.
 */
function writtenKeys(kind: KindName, text: string): (key: string) => boolean {
  const fileKind = fileKinds[kind];
  if (fileKind.syntax === "front-matter") return () => true;
  const read = readYaml(text);
  const data = read.ok ? read.value.data : undefined;
  if (typeof data !== "object" || data === null) return () => false;
  const upgraded = fileKind.upgradeKeys?.(data as Record<string, unknown>) ?? data;
  return (key) => Object.hasOwn(upgraded, key);
}

/** Whether a field holds something to show: not missing and not empty text. */
function isSet(value: unknown): boolean {
  return value !== undefined && value !== "";
}
