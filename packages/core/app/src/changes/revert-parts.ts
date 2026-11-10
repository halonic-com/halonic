import { deepEqual, err, isPlainObject, ok, type Result } from "@halonicjs/std";
import { editYaml, readYaml, type YamlEdit } from "@halonicjs/yaml";

/**
 * A path into a parsed item by map keys only, such as `["states", "classify"]`
 * for a workflow step or `["model"]` for an agent's field. It never holds a
 * list position, so undoing one change never moves the path of another. A
 * list is always reverted whole.
 */
export type ItemPath = readonly string[];

/**
 * One line of "what changed" in an item, as a describer gives it.
 * `parts` are what the line covers; `needs` lists the ids of the lines this
 * one depends on, so they can't be undone or rejected before this one (and
 * this one can't be accepted before them): "Step *Notify* uses this. Undo
 * that change first."
 */
export interface ChangeLine {
  /** Stable within one description, such as `step:page-oncall`. */
  readonly id: string;
  readonly sentence: string;
  /** Listed first, under "Important", as before → after. */
  readonly important?: boolean;
  /** Empty for a kind that has no parts in v0.1; callers use the line diff instead. */
  readonly parts: readonly ItemPath[];
  readonly needs?: readonly string[];
}

/** Why `revertParts` couldn't revert: a text it couldn't read, or an edit `editYaml` refused. */
export interface RevertPartsProblem {
  readonly which: "current" | "reference" | "edit";
  readonly message: string;
}

/**
 * Sets some parts of an item's YAML text back to how they are in a
 * reference text, keeping the rest of the text, comments and formatting as
 * they are. For each part: if the reference has it, it's set to the
 * reference's value; if the reference doesn't, it's removed; if only the
 * reference has it, it goes back right after the key it follows in the
 * reference (first when nothing before it is left).
 *
 * The same function serves three callers, with three references: Undo this
 * change (the latest version), Accept and Reject one change on an item page
 * (the assistant's baseline) and in a run proposal (the run's base). To
 * accept a change, revert the part in the baseline with the file as
 * reference; to reject it, revert it in the file with the baseline as
 * reference.
 *
 * When the result reads the same as the reference, the reference's text is
 * given back as it is, so an item whose every change was undone is clean,
 * not just equal. The cost: a comment, blank line or spacing changed since
 * the reference is dropped then too, because no part describes it.
 *
 * @param current - the item's YAML text to change
 * @param reference - the YAML text to take the parts from
 * @param parts - the paths to revert, from `ChangeLine.parts`
 * @returns the new text of `current`
 *
 * @example
 * revertParts("model: large\nname: Triage\n", "model: small\nname: Old\n", [["model"]]);
 * // { ok: true, value: "model: small\nname: Triage\n" }
 */
export function revertParts(
  current: string,
  reference: string,
  parts: readonly ItemPath[],
): Result<string, RevertPartsProblem> {
  const referenceRead = readYaml(reference);
  if (!referenceRead.ok) {
    return err({ which: "reference", message: referenceRead.error.message });
  }
  const referenceData = referenceRead.value.data;

  let text = current;
  for (const path of parts) {
    const currentRead = readYaml(text);
    if (!currentRead.ok) {
      return err({ which: "current", message: currentRead.error.message });
    }
    const edit = revertEdit(currentRead.value.data, referenceData, path);
    if (edit === undefined) {
      continue;
    }
    const edited = editYaml(text, [edit]);
    if (!edited.ok) {
      return err({ which: "edit", message: edited.error.message });
    }
    text = edited.value.text;
  }
  return ok(readsTheSame(text, referenceData) ? reference : text);
}

/** The one edit that sets `path` in `currentData` back to how `referenceData` has it, if any. */
function revertEdit(
  currentData: unknown,
  referenceData: unknown,
  path: ItemPath,
): YamlEdit | undefined {
  const inReference = valueAt(referenceData, path);
  const inCurrent = valueAt(currentData, path);
  if (!inReference.found) {
    return inCurrent.found ? { kind: "delete", path } : undefined;
  }
  if (inCurrent.found && deepEqual(inCurrent.value, inReference.value)) {
    return undefined;
  }
  if (inCurrent.found) {
    return { kind: "set", path, value: inReference.value };
  }
  return {
    kind: "set",
    path,
    value: inReference.value,
    after: neighbourBefore(currentData, referenceData, path),
  };
}

/**
 * The key a re-added entry goes after: the nearest key before it in the
 * reference's map that the current map still has, or `null` for first.
 */
function neighbourBefore(
  currentData: unknown,
  referenceData: unknown,
  path: ItemPath,
): string | null {
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const referenceParent = valueAt(referenceData, parentPath);
  const currentParent = valueAt(currentData, parentPath);
  if (!isPlainObject(referenceParent.value) || !isPlainObject(currentParent.value)) {
    return null;
  }
  const currentKeys = new Set(Object.keys(currentParent.value));
  const referenceKeys = Object.keys(referenceParent.value);
  const before = referenceKeys.slice(0, referenceKeys.indexOf(key as string));
  return before.findLast((candidate) => currentKeys.has(candidate)) ?? null;
}

/** The value at `path` in plain data, and whether there is one; a list on the way means none. */
function valueAt(data: unknown, path: ItemPath): { found: boolean; value: unknown } {
  let value = data;
  for (const key of path) {
    if (!isPlainObject(value) || !Object.hasOwn(value, key)) {
      return { found: false, value: undefined };
    }
    value = value[key];
  }
  return { found: true, value };
}

function readsTheSame(text: string, referenceData: unknown): boolean {
  const read = readYaml(text);
  return read.ok && deepEqual(read.value.data, referenceData);
}
