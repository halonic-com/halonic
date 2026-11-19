import type { StateType, WorkflowState } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import type { WorkflowStepChange } from "@halonicjs/studio-feature-workflows/api";
import type { YamlEdit } from "@halonicjs/yaml";

/** The six kinds a step's `type` can be; the record keeps the list the same as the format's. */
const stepTypes: Readonly<Record<StateType, true>> = {
  task: true,
  wait: true,
  final: true,
  workflow: true,
  parallel: true,
  foreach: true,
};

/** The key in the step's part of the file that each text field of the docked step card changes. */
const stepTextKeys = [
  ["agent", "agent"],
  ["description", "description"],
  ["prompt", "input"],
  ["output", "output"],
] as const satisfies readonly (readonly [keyof WorkflowStepChange, keyof WorkflowState])[];

/**
 * The edits of the workflow's file that make one change of the step `stepId`: each field given is
 * set, and an empty text is taken out of the file. A new kind sets only `type`: the keys of the old
 * kind stay, so changing back finds them, and the card shows only the new kind's fields.
 *
 * @throws `invalid_input` for a kind the format doesn't have, or a prompt the file gives as data
 */
export function stepEdits(
  stepId: string,
  state: WorkflowState,
  change: WorkflowStepChange,
): readonly YamlEdit[] {
  if (change.prompt !== undefined && state.input !== undefined && typeof state.input !== "string") {
    throw new KindedError(
      "invalid_input",
      "This step's prompt is written as data in its file, so it can only be changed there.",
    );
  }
  const edits: YamlEdit[] = [];
  if (change.type !== undefined) {
    if (!Object.hasOwn(stepTypes, change.type)) {
      throw new KindedError("invalid_input", `A step can't be of the kind "${change.type}".`);
    }
    edits.push({ kind: "set", path: ["states", stepId, "type"], value: change.type });
  }
  for (const [field, key] of stepTextKeys) {
    const next = change[field];
    if (next === undefined) continue;
    const path = ["states", stepId, key];
    if (next.trim() !== "") edits.push({ kind: "set", path, value: next });
    else if (state[key] !== undefined) edits.push({ kind: "delete", path });
  }
  return edits;
}
