import { parseFile, type Transition, type WorkflowState } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import type {
  WorkflowArrowChange,
  WorkflowArrowFieldChange,
} from "@halonicjs/studio-feature-workflows/api";
import type { YamlEdit } from "@halonicjs/yaml";

/**
 * The step's arrows as its file writes them, from the file's data as read (no defaults filled in),
 * or `undefined` when the step has no `on` list.
 */
export function writtenArrows(data: unknown, stepId: string): readonly unknown[] | undefined {
  const states = recordAt(data, "states");
  const on = recordAt(states, stepId)?.["on"];
  return Array.isArray(on) ? on : undefined;
}

/**
 * The edits of the workflow's file that make one change of the arrows out of `stepId`: a new arrow
 * `{ to }` (on done, the format's default) after the others, one arrow moved one place up or down
 * together with its comments, or one field of an arrow set or taken out.
 *
 * @param stepIds - the workflow's steps, which a new arrow must go to
 * @param written - the step's arrows as its file writes them (see {@link writtenArrows})
 * @throws `invalid_input` for an arrow to a step the workflow doesn't have, an arrow that isn't
 *   there or can't move that way, and one that no longer goes to the change's `to`; whether a
 *   field's new value fits the format is {@link checkArrowChange}'s
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
  const inList = (at: number) => Number.isInteger(at) && at >= 0 && at < arrows.length;
  if (change.kind === "set") {
    if (!inList(change.index)) throw new KindedError("invalid_input", "This arrow isn't there.");
    checkStillGoesTo(arrows[change.index], change.to, "change");
    return fieldEdits([...path, change.index], stepIds, change);
  }
  const { index } = change;
  const place = index + change.by;
  if (!inList(index) || !inList(place)) {
    throw new KindedError("invalid_input", "This arrow can't move that way.");
  }
  checkStillGoesTo(arrows[index], change.to, "move");
  return [{ kind: "move", path: [...path, index], to: place }];
}

/**
 * Throws `invalid_input` when `arrow`, as the file writes it, no longer goes to `to`, the step the
 * card showed it going to: the arrows changed since the card read them (in the file, or in another
 * window), so the change would land on another arrow.
 */
function checkStillGoesTo(arrow: unknown, to: string, verb: "move" | "change"): void {
  if (recordOf(arrow)?.["to"] === to) return;
  throw new KindedError(
    "invalid_input",
    `This step's arrows changed in the meantime. Look at them again, then ${verb} the arrow.`,
  );
}

/** The file's key for each field of an arrow's row. */
const arrowKeys: Readonly<Record<WorkflowArrowFieldChange["field"], string>> = {
  to: "to",
  event: "event",
  after: "after",
  condition: "when",
  label: "label",
};

/**
 * The edits that set one field of the arrow at `arrowPath`, or take it out for `undefined`. The
 * format's default event, done, is taken out too, so the file keeps the shorter form. A timer
 * replaces the arrow's event. Whether the value fits the format (a time such as "2d", a condition
 * it knows) is checked on the edited file, not here.
 */
function fieldEdits(
  arrowPath: readonly (string | number)[],
  stepIds: readonly string[],
  change: WorkflowArrowFieldChange,
): readonly YamlEdit[] {
  const at = [...arrowPath, arrowKeys[change.field]];
  if (change.field === "to") {
    if (!stepIds.includes(change.value)) {
      throw new KindedError("invalid_input", `This workflow has no step "${change.value}".`);
    }
    return [{ kind: "set", path: at, value: change.value }];
  }
  const value =
    change.field === "event" && change.value === "done" ? undefined : (change.value as unknown);
  if (value === undefined) return [{ kind: "delete", path: at }];
  const set: YamlEdit = { kind: "set", path: at, value };
  return change.field === "after"
    ? [{ kind: "delete", path: [...arrowPath, arrowKeys.event] }, set]
    : [set];
}

/** The name of an arrow's change in the undo list. */
export function arrowChangeLabel(
  stepId: string,
  workflowName: string,
  change: WorkflowArrowChange,
): string {
  if (change.kind === "add") {
    return `Added an arrow from ${stepId} to ${change.to} in workflow ${workflowName}`;
  }
  const verb = change.kind === "move" ? "Moved" : "Changed";
  return `${verb} an arrow of step ${stepId} in workflow ${workflowName}`;
}

/**
 * Throws `invalid_input`, saying what is wrong, when `text` (the workflow's file `id` with one of
 * its arrows changed) no longer reads as a workflow: a time the format doesn't take, a condition
 * it doesn't know. The file read before the change, so the problem is the change's. The rules
 * between steps (timers only on waits) are the Problems page's, as for any other edit.
 */
export function checkArrowChange(text: string, id: string): void {
  const parsed = parseFile("workflow", text, { id });
  if (parsed.ok) return;
  const [problem] = parsed.error;
  throw new KindedError("invalid_input", asSentence(problem?.message ?? ""));
}

/** `text` with a capital first letter and a full stop, as a toast's reason reads. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

/**
 * The edits that give the picked step `from` an arrow on done to `to`, the step the canvas's
 * toolbar is adding after it (C544-10), after its other arrows. None when `from` ends the
 * workflow, or already has an on-done arrow without a condition: the first arrow that matches
 * wins, so the new one would never fire. With only conditional arrows, the new one is the
 * "otherwise".
 *
 * @param written - `from`'s arrows as its file writes them (see {@link writtenArrows})
 */
export function arrowToNewStep(
  from: string,
  state: WorkflowState,
  written: readonly unknown[] | undefined,
  to: string,
): readonly YamlEdit[] {
  if (state.type === "final" || state.on.some(isPlainDone)) return [];
  return arrowEdits(from, [to], written, { kind: "add", to });
}

/** Whether the arrow fires whenever the step is done: on done, with no condition and no timer. */
function isPlainDone(arrow: Transition): boolean {
  return arrow.event === "done" && arrow.when === undefined && arrow.after === undefined;
}

/** The map at `key` of `value`, or `undefined` when there is none. */
function recordAt(value: unknown, key: string): Record<string, unknown> | undefined {
  const map = recordOf(value);
  return map !== undefined && Object.hasOwn(map, key) ? recordOf(map[key]) : undefined;
}

/** `value` as a map, or `undefined` when it isn't one. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
