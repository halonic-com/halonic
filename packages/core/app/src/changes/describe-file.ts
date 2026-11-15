import { type KindName, type KindValues, parseFile } from "@halonicjs/format";
import { placeOf } from "@halonicjs/workspace";
import { describeItemChange } from "./describe-item.ts";
import type { ChangeLine } from "./revert-parts.ts";

/** What changed in one file of the workspace, for the Changes page. */
export interface FileChange {
  readonly path: string;
  /** The item's kind, or `undefined` for a file no kind places, such as a README. */
  readonly kind: KindName | undefined;
  /** The lines to show, Important ones first. Empty only when the two texts are the same. */
  readonly lines: readonly ChangeLine[];
  /**
   * Whether `lines` come from the item's contents. `false` when the file isn't an item, or a text
   * can't be read as one, or only its comments changed: the one line then says only "Changed", "New" or "Deleted", and
   * the caller offers the line diff instead.
   */
  readonly described: boolean;
}

/**
 * Describes what changed in one workspace file between two texts, for the Changes page: its kind
 * comes from where it sits, both texts are read as that kind, and `describeItemChange` gives the
 * lines, Important ones first. A file that is no item, doesn't read, or changed only in its
 * comments or spacing gets one line without parts.
 *
 * @param path - the file's path in the workspace, "/" separated
 * @param before - the file as it was in the last version; `null` if it is new
 * @param after - the file as it is; `null` if it was deleted
 *
 * @example
 * describeFileChange("agents/triage.agent.yaml", lastVersionText, currentText);
 * // { path, kind: "agent", described: true, lines: [{ id: "field:model", sentence: "Model: claude → gpt", parts: [["model"]] }] }
 */
export function describeFileChange(
  path: string,
  before: string | null,
  after: string | null,
): FileChange {
  const place = placeOf(path);
  if (place !== undefined) {
    const lines = describeItem(place.kind, place.placeId, before, after);
    if (lines !== undefined && (lines.length > 0 || before === after)) {
      return { path, kind: place.kind, lines: importantFirst(lines), described: true };
    }
  }
  return { path, kind: place?.kind, lines: [wholeFileLine(before, after)], described: false };
}

/** The item's lines, or `undefined` when a text that exists doesn't read as the kind. */
function describeItem<Name extends KindName>(
  kind: Name,
  id: string | undefined,
  before: string | null,
  after: string | null,
): ChangeLine[] | undefined {
  const was = read(kind, id, before);
  const is = read(kind, id, after);
  if (was === "unreadable" || is === "unreadable") return undefined;
  return describeItemChange(kind, was, is);
}

function read<Name extends KindName>(
  kind: Name,
  id: string | undefined,
  text: string | null,
): KindValues[Name] | undefined | "unreadable" {
  if (text === null) return undefined;
  const parsed = parseFile(kind, text, id === undefined ? {} : { id });
  return parsed.ok ? parsed.value.value : "unreadable";
}

function wholeFileLine(before: string | null, after: string | null): ChangeLine {
  if (before === null) return { id: "item", sentence: "New", parts: [] };
  if (after === null) return { id: "item", sentence: "Deleted", parts: [] };
  return { id: "item", sentence: "Changed", parts: [] };
}

/** Important lines first; each group keeps the describer's order. */
function importantFirst(lines: readonly ChangeLine[]): ChangeLine[] {
  return [...lines.filter((line) => line.important), ...lines.filter((line) => !line.important)];
}
