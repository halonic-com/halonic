import type { Workflow, WorkflowState } from "@halonicjs/format";
import { deepEqual } from "@halonicjs/std";
import { joinLinesThatNeedEachOther } from "./change-needs.ts";
import { keysInOrder, nameFromId, wholeItemLine } from "./describe-fields.ts";
import type { ChangeLine, ItemPath } from "./revert-parts.ts";

/**
 * The workflow's own fields, in the order their lines are listed. A field not
 * listed here gets a line too, after these, under its key. `states` and
 * `layout` have their own lines.
 */
const WORKFLOW_FIELDS: Readonly<Record<string, string>> = {
  name: "Name",
  description: "Description",
  initial: "Starts at",
  context: "Starting context",
  start: "Inbox request",
  version: "Format version",
  id: "Id",
};

/** How a step's fields are named in "Step changed: Notify (agent, next steps)". A field not listed here is named by its key. */
const STEP_FIELDS: Readonly<Record<string, string>> = {
  type: "type",
  description: "description",
  agent: "agent",
  workflow: "workflow",
  input: "input",
  gets: "data it gets",
  output: "output",
  conversation: "conversation",
  format: "reply format",
  signal: "signal",
  method: "method",
  with: "arguments",
  items: "items",
  as: "item name",
  concurrency: "how many at once",
  branches: "branches",
  join: "join",
  continueOnError: "on error",
  artifact: "artifact",
  on: "next steps",
};

const CONTEXT_KEY = /\bcontext\.([A-Za-z0-9_-]+)/g;

/**
 * Describes what changed between two versions of a workflow, one line per
 * step added, removed or changed and one per workflow field, each with the
 * parts it covers. A step's line also covers its place in `layout`.
 *
 * A line needs another when undoing the other alone would leave the workflow
 * pointing at a step that isn't there, so the other can't be undone before
 * this line: a step changed to go to, or read the output of, a step that was
 * added needs that step's line; a step removed that another step went to or
 * read from needs the line of the step that stopped; and "Starts at" needs
 * the line of the added step it starts at. Lines that need each other are
 * joined into one.
 *
 * A workflow that is new or deleted as a whole gets one line, "New" or
 * "Deleted", with no parts: undoing it is undoing the file.
 *
 * @param before - the workflow as it was (`undefined` if it's new)
 * @param after - the workflow as it is (`undefined` if it was deleted)
 *
 * @example
 * describeWorkflowChange(lastVersion, current);
 * // [{ id: "step:page-oncall", sentence: "Step added: Page oncall", parts: [["states", "page-oncall"]] },
 * //  { id: "step:notify", sentence: "Step changed: Notify (input)", parts: [["states", "notify"]], needs: ["step:page-oncall"] }]
 */
export function describeWorkflowChange(
  before: Workflow | undefined,
  after: Workflow | undefined,
): ChangeLine[] {
  if (before === undefined || after === undefined) {
    return wholeItemLine(before, after);
  }

  const lines: ChangeLine[] = [];
  const fields = keysInOrder(WORKFLOW_FIELDS, before, after).filter(
    (field) => field !== "states" && field !== "layout",
  );
  for (const field of fields) {
    const line = fieldLine(field, WORKFLOW_FIELDS[field] ?? field, before, after);
    if (line !== undefined) {
      lines.push(line);
    }
  }

  const stepLines = new Map<string, ChangeLine>();
  for (const stepId of stepIdsInOrder(before, after)) {
    const line = stepLine(stepId, before, after);
    if (line !== undefined) {
      stepLines.set(stepId, line);
      lines.push(line);
    }
  }

  const layoutLine = otherLayoutLine(before, after, stepLines);
  if (layoutLine !== undefined) {
    lines.push(layoutLine);
  }

  const withNeeds = lines.map((line) => ({
    ...line,
    ...needsOf(line, before, after, stepLines),
  }));
  return joinLinesThatNeedEachOther(withNeeds);
}

function fieldLine(
  field: string,
  label: string,
  before: Workflow,
  after: Workflow,
): ChangeLine | undefined {
  const was = (before as Record<string, unknown>)[field];
  const is = (after as Record<string, unknown>)[field];
  if (deepEqual(was, is)) {
    return undefined;
  }
  return { id: `field:${field}`, sentence: fieldSentence(field, label, was, is), parts: [[field]] };
}

function fieldSentence(field: string, label: string, was: unknown, is: unknown): string {
  if (was === undefined) {
    return `${label} added`;
  }
  if (is === undefined) {
    return `${label} removed`;
  }
  if (field === "initial") {
    return `${label}: ${nameFromId(String(was))} → ${nameFromId(String(is))}`;
  }
  if (field === "name" || field === "version" || field === "id") {
    return `${label}: ${String(was)} → ${String(is)}`;
  }
  return `${label} edited`;
}

/** Every step id, in the after version's order, with removed steps where they were. */
function stepIdsInOrder(before: Workflow, after: Workflow): string[] {
  const ids = Object.keys(after.states);
  const beforeIds = Object.keys(before.states);
  beforeIds.forEach((id, index) => {
    if (ids.includes(id)) {
      return;
    }
    const previous = beforeIds.slice(0, index).findLast((candidate) => ids.includes(candidate));
    ids.splice(previous === undefined ? 0 : ids.indexOf(previous) + 1, 0, id);
  });
  return ids;
}

function stepLine(stepId: string, before: Workflow, after: Workflow): ChangeLine | undefined {
  const was = before.states[stepId];
  const is = after.states[stepId];
  const layoutChanged = !deepEqual(before.layout[stepId], after.layout[stepId]);
  const parts: ItemPath[] = [["states", stepId]];
  if (layoutChanged) {
    parts.push(["layout", stepId]);
  }
  const id = `step:${stepId}`;
  const name = nameFromId(stepId);
  if (was === undefined) {
    return { id, sentence: `Step added: ${name}`, parts };
  }
  if (is === undefined) {
    return { id, sentence: `Step removed: ${name}`, parts };
  }
  const changed = keysInOrder(STEP_FIELDS, was, is).filter(
    (field) =>
      !deepEqual((was as Record<string, unknown>)[field], (is as Record<string, unknown>)[field]),
  );
  if (changed.length > 0) {
    const fields = changed.map((field) => STEP_FIELDS[field] ?? field).join(", ");
    return { id, sentence: `Step changed: ${name} (${fields})`, parts };
  }
  if (layoutChanged) {
    return { id, sentence: `Step moved: ${name}`, parts };
  }
  return undefined;
}

/** Layout entries no step line covers, such as one for a step that no longer exists. */
function otherLayoutLine(
  before: Workflow,
  after: Workflow,
  stepLines: ReadonlyMap<string, ChangeLine>,
): ChangeLine | undefined {
  const keys = new Set([...Object.keys(before.layout), ...Object.keys(after.layout)]);
  const parts: ItemPath[] = [];
  for (const key of keys) {
    if (!stepLines.has(key) && !deepEqual(before.layout[key], after.layout[key])) {
      parts.push(["layout", key]);
    }
  }
  return parts.length === 0 ? undefined : { id: "layout", sentence: "Step positions moved", parts };
}

function needsOf(
  line: ChangeLine,
  before: Workflow,
  after: Workflow,
  stepLines: ReadonlyMap<string, ChangeLine>,
): { needs?: string[] } {
  const needs = new Set([
    ...addedStepsPointedAt(line, before, after, stepLines),
    ...changesAwayFromRemovedStep(line, before, after, stepLines),
  ]);
  needs.delete(line.id);
  return needs.size > 0 ? { needs: [...needs] } : {};
}

/** The lines of the added steps this line's after side points at. */
function addedStepsPointedAt(
  line: ChangeLine,
  before: Workflow,
  after: Workflow,
  stepLines: ReadonlyMap<string, ChangeLine>,
): string[] {
  return [...pointsAt(line, after)]
    .filter((target) => before.states[target] === undefined)
    .map((target) => stepLines.get(target)?.id)
    .filter((id): id is string => id !== undefined);
}

/** For a line that removes a step: the lines that stopped pointing at it. */
function changesAwayFromRemovedStep(
  line: ChangeLine,
  before: Workflow,
  after: Workflow,
  stepLines: ReadonlyMap<string, ChangeLine>,
): string[] {
  const stepId = stepIdOf(line);
  if (stepId === undefined || after.states[stepId] !== undefined) {
    return [];
  }
  const needs = [...stepLines.values()]
    .filter((other) => pointsAt(other, before).has(stepId))
    .map((other) => other.id);
  if (before.initial === stepId && after.initial !== stepId) {
    needs.push("field:initial");
  }
  return needs;
}

function stepIdOf(line: ChangeLine): string | undefined {
  return line.id.startsWith("step:") ? line.id.slice("step:".length) : undefined;
}

/** The step ids a line's subject points at in one version: its transitions, the outputs it reads, or where it starts. */
function pointsAt(line: ChangeLine, workflow: Workflow): Set<string> {
  if (line.id === "field:initial") {
    return new Set([workflow.initial]);
  }
  const stepId = stepIdOf(line);
  const step = stepId === undefined ? undefined : workflow.states[stepId];
  if (stepId === undefined || step === undefined) {
    return new Set();
  }
  const targets = new Set(step.on.map((transition) => transition.to));
  for (const key of contextKeysRead(step)) {
    for (const [otherId, other] of Object.entries(workflow.states)) {
      if (otherId !== stepId && other.output === key) {
        targets.add(otherId);
      }
    }
  }
  targets.delete(stepId);
  return targets;
}

/** The context keys a step reads, from `gets` and from the templates in its fields. */
function contextKeysRead(step: WorkflowState): Set<string> {
  const keys = new Set<string>();
  const { on: _transitions, output: _output, ...reading } = step;
  for (const text of stringsIn(reading)) {
    for (const match of text.matchAll(CONTEXT_KEY)) {
      keys.add(match[1] as string);
    }
  }
  return keys;
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringsIn);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(stringsIn);
  }
  return [];
}
