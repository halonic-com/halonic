// A collection file's name, read and changed again without touching the rest
// of the file (requirement `app.collection-text`). Nothing is read from disk or
// written: the caller keeps the text and saves it as one change.

import { err, ok, type Result } from "@halonicjs/std";
import { editYaml, readYaml } from "@halonicjs/yaml";

/**
 * Why a collection's name can't be read or changed. `name_missing` means the change would empty
 * the name, which the page refuses; `unreadable` means the file isn't valid YAML or isn't a map,
 * so only a person can fix it in the file.
 */
export type CollectionTextError = "name_missing" | "unreadable";

function mapOf(text: string): Record<string, unknown> | undefined {
  const read = readYaml(text);
  if (!read.ok) {
    return undefined;
  }
  const data = read.value.data;
  return typeof data === "object" && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
}

/**
 * The name the collection page shows in its header; empty when the file has none.
 *
 * @example
 * readCollectionName("id: claims\nname: Claims\nfields: {}\n");
 * // ok("Claims")
 */
export function readCollectionName(text: string): Result<string, CollectionTextError> {
  const data = mapOf(text);
  if (data === undefined) {
    return err("unreadable");
  }
  return ok(typeof data["name"] === "string" ? data["name"] : "");
}

/**
 * The collection's text with its name changed. The id, the fields, the views, the seed records
 * and the comments keep their values and order, and the text is returned as it was when the name
 * is unchanged, so a rename field left alone writes nothing. A name that is empty after trimming
 * is refused rather than written.
 *
 * @example
 * renameCollectionText("id: claims\nname: Old # shown\nfields: {}\n", "Claims");
 * // ok("id: claims\nname: Claims # shown\nfields: {}\n")
 */
export function renameCollectionText(
  text: string,
  name: string,
): Result<string, CollectionTextError> {
  const data = mapOf(text);
  if (data === undefined) {
    return err("unreadable");
  }
  const next = name.trim();
  if (next === "") {
    return err("name_missing");
  }
  if (data["name"] === next) {
    return ok(text);
  }
  const edited = editYaml(text, [{ kind: "set", path: ["name"], value: next }]);
  return edited.ok ? ok(edited.value.text) : err("unreadable");
}
