import type { KindName, KindValues } from "@halonicjs/format";
import { deepEqual } from "@halonicjs/std";
import { describeAgentChange } from "./describe-agent.ts";
import { wholeItemLine } from "./describe-fields.ts";
import { describeRoutineChange } from "./describe-routine.ts";
import { describeWorkflowChange } from "./describe-workflow.ts";
import type { ChangeLine } from "./revert-parts.ts";

type Describer<Value> = (before: Value | undefined, after: Value | undefined) => ChangeLine[];

/** The kinds that have parts in v0.1 (Changes design 8, widened to routines). */
const DESCRIBERS: { readonly [Name in KindName]?: Describer<KindValues[Name]> } = {
  workflow: describeWorkflowChange,
  agent: describeAgentChange,
  routine: describeRoutineChange,
};

/**
 * Describes what changed in an item of any kind, for Changes, Accept and
 * Reject on an item page, and a run's proposal alike. Workflows, agents and
 * routines get their own describer, with a line per change and the parts to
 * undo it. Every other kind gets one line without parts, "Changed", "New" or
 * "Deleted", and its callers offer per-file and per-line-part actions on the
 * line diff instead. A rename isn't seen here: the caller knows the file
 * moved, and says "Renamed from Support" itself.
 *
 * @param kind - the item's kind, as the format registry names it
 * @param before - the item as it was (`undefined` if it's new)
 * @param after - the item as it is (`undefined` if it was deleted)
 *
 * @example
 * describeItemChange("models", lastVersion, current); // [{ id: "item", sentence: "Changed", parts: [] }]
 */
export function describeItemChange<Name extends KindName>(
  kind: Name,
  before: KindValues[Name] | undefined,
  after: KindValues[Name] | undefined,
): ChangeLine[] {
  // The table is checked per kind; TypeScript can't follow `Name` through the lookup.
  const describer = DESCRIBERS[kind] as Describer<KindValues[Name]> | undefined;
  if (describer !== undefined) {
    return describer(before, after);
  }
  if (before === undefined || after === undefined) {
    return wholeItemLine(before, after);
  }
  return deepEqual(before, after) ? [] : [{ id: "item", sentence: "Changed", parts: [] }];
}
