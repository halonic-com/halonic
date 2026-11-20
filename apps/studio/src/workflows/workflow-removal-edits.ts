import { KindedError } from "@halonicjs/std";
import type { YamlEdit } from "@halonicjs/yaml";
import { writtenArrows } from "./workflow-arrow-edits.ts";

/** The edits that take a step out of a workflow's file, and how many arrows go with it. */
export interface StepRemoval {
  readonly edits: readonly YamlEdit[];
  readonly arrows: number;
}

/**
 * The edits of the workflow's file that take the step `stepId` out: the step with its own arrows,
 * its place in `layout`, and every other step's arrows into it. A step left with no arrows loses
 * its `on` list, so the file doesn't keep an empty one.
 *
 * @param data - the workflow's file as read (no defaults filled in)
 * @param stepIds - the workflow's steps, in the file's order
 */
export function stepRemovalEdits(
  data: unknown,
  stepId: string,
  stepIds: readonly string[],
): StepRemoval {
  const edits: YamlEdit[] = [];
  let arrows = writtenArrows(data, stepId)?.length ?? 0;
  for (const other of stepIds) {
    if (other === stepId) continue;
    const written = writtenArrows(data, other) ?? [];
    const into = written.flatMap((arrow, index) => (targetOf(arrow) === stepId ? [index] : []));
    arrows += into.length;
    edits.push(...arrowsOut(other, written.length, into));
  }
  edits.push({ kind: "delete", path: ["states", stepId] });
  if (hasPlace(data, stepId)) edits.push({ kind: "delete", path: ["layout", stepId] });
  return { edits, arrows };
}

/**
 * The edits of the workflow's file that take the arrow at `index` out of the step `stepId`.
 *
 * @param written - the step's arrows as its file writes them
 * @throws `invalid_input` for an arrow that isn't there
 */
export function arrowRemovalEdits(
  stepId: string,
  written: readonly unknown[] | undefined,
  index: number,
): readonly YamlEdit[] {
  const count = written?.length ?? 0;
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new KindedError("invalid_input", "This arrow isn't there.");
  }
  return arrowsOut(stepId, count, [index]);
}

/**
 * The edits that take the arrows at `indexes` (in file order) out of the step's `on` list of
 * `count` arrows: the whole list when none would be left, else each one from the last, so every
 * index still points at the arrow it named.
 */
function arrowsOut(stepId: string, count: number, indexes: readonly number[]): readonly YamlEdit[] {
  const on = ["states", stepId, "on"];
  if (indexes.length === 0) return [];
  if (indexes.length === count) return [{ kind: "delete", path: on }];
  return [...indexes].reverse().map((index) => ({ kind: "delete", path: [...on, index] }));
}

/** The step an arrow as its file writes it goes to, or `undefined` when it names none. */
function targetOf(arrow: unknown): unknown {
  return typeof arrow === "object" && arrow !== null ? (arrow as { to?: unknown }).to : undefined;
}

/** Whether the file gives the step a place on the canvas. */
function hasPlace(data: unknown, stepId: string): boolean {
  if (typeof data !== "object" || data === null) return false;
  const layout = (data as { layout?: unknown }).layout;
  return typeof layout === "object" && layout !== null && Object.hasOwn(layout, stepId);
}
