import { KindedError } from "@halonicjs/std";
import type { WorkflowArrowChange } from "@halonicjs/studio-feature-workflows/api";
import type { YamlEdit } from "@halonicjs/yaml";

/**
 * The step's arrows as its file writes them, from the file's data as read (no defaults filled in),
 * or `undefined` when the step has no `on` list. A moved arrow is written back from these, so it
 * keeps only the keys the file gives it.
 */
export function writtenArrows(data: unknown, stepId: string): readonly unknown[] | undefined {
  const states = recordAt(data, "states");
  const on = recordAt(states, stepId)?.["on"];
  return Array.isArray(on) ? on : undefined;
}

/**
 * The edits of the workflow's file that make one change of the arrows out of `stepId`: a new arrow
 * `{ to }` (on done, the format's default) after the others, or one arrow taken out and put back
 * one place up or down.
 *
 * @param stepIds - the workflow's steps, which a new arrow must go to
 * @param written - the step's arrows as its file writes them (see {@link writtenArrows})
 * @throws `invalid_input` for an arrow to a step the workflow doesn't have, and an arrow that isn't
 *   there or can't move that way
 */
export function arrowEdits(
  stepId: string,
  stepIds: readonly string[],
  written: readonly unknown[] | undefined,
  change: WorkflowArrowChange,
): readonly YamlEdit[] {
  const path = ["states", stepId, "on"];
  if (change.kind === "add") {
    if (!stepIds.includes(change.to)) {
      throw new KindedError("invalid_input", `This workflow has no step "${change.to}".`);
    }
    const arrow = { to: change.to };
    return written === undefined
      ? [{ kind: "set", path, value: [arrow] }]
      : [{ kind: "insert", path: [...path, written.length], value: arrow }];
  }
  const arrows = written ?? [];
  const { index } = change;
  const place = index + change.by;
  const inList = (at: number) => Number.isInteger(at) && at >= 0 && at < arrows.length;
  if (!inList(index) || !inList(place)) {
    throw new KindedError("invalid_input", "This arrow can't move that way.");
  }
  return [
    { kind: "delete", path: [...path, index] },
    { kind: "insert", path: [...path, place], value: arrows[index] },
  ];
}

/** The map at `key` of `value`, or `undefined` when there is none. */
function recordAt(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, key)) return undefined;
  const child = (value as Record<string, unknown>)[key];
  return typeof child === "object" && child !== null && !Array.isArray(child)
    ? (child as Record<string, unknown>)
    : undefined;
}
