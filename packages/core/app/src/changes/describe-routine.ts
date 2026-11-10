import type { Routine, RoutineTarget } from "@halonicjs/format";
import { describeTrigger } from "@halonicjs/routines";
import { deepEqual } from "@halonicjs/std";
import { fieldOf, keysInOrder, wholeItemLine } from "./describe-fields.ts";
import type { ChangeLine } from "./revert-parts.ts";

/** The routine's fields, in the order their lines are listed. A field not listed here gets a line too, after these, under its key. */
const ROUTINE_FIELDS: Readonly<Record<string, string>> = {
  name: "Name",
  description: "Description",
  enabled: "On",
  trigger: "Schedule",
  run: "Runs",
  overlap: "When the last run is still going",
  catchUp: "Missed times",
  version: "Format version",
  id: "Id",
};

const OVERLAP_WORDS: Readonly<Record<Routine["overlap"], string>> = {
  skip: "skip",
  queue: "wait",
  allow: "start anyway",
};

const CATCH_UP_WORDS: Readonly<Record<Routine["catchUp"], string>> = {
  none: "skip them",
  last: "run the last one",
  all: "run them all",
};

/**
 * Describes what changed between two versions of a routine, one line per
 * field, each with the part it covers. What the routine runs (its workflow
 * and input, or its agent and prompt) is marked important, because it's
 * what the routine is told to do. A routine's fields are flat, so no line
 * needs another.
 *
 * A routine that is new or deleted as a whole gets one line, "New" or
 * "Deleted", with no parts: undoing it is undoing the file.
 *
 * @param before - the routine as it was (`undefined` if it's new)
 * @param after - the routine as it is (`undefined` if it was deleted)
 *
 * @example
 * describeRoutineChange(lastVersion, current);
 * // [{ id: "field:trigger", sentence: "Schedule: Weekdays at 08:00 → Weekdays at 07:00", parts: [["trigger"]] }]
 */
export function describeRoutineChange(
  before: Routine | undefined,
  after: Routine | undefined,
): ChangeLine[] {
  if (before === undefined || after === undefined) {
    return wholeItemLine(before, after);
  }
  const lines: ChangeLine[] = [];
  for (const field of keysInOrder(ROUTINE_FIELDS, before, after)) {
    const was = fieldOf(before, field);
    const is = fieldOf(after, field);
    if (!deepEqual(was, is)) {
      lines.push({
        id: `field:${field}`,
        sentence: fieldSentence(field, was, is),
        ...(field === "run" ? { important: true } : {}),
        parts: [[field]],
      });
    }
  }
  return lines;
}

function fieldSentence(field: string, was: unknown, is: unknown): string {
  const label = ROUTINE_FIELDS[field] ?? field;
  switch (field) {
    case "enabled":
      return is === true ? "Turned on" : "Turned off";
    case "trigger":
      return `${label}: ${describeTrigger(was as Routine["trigger"])} → ${describeTrigger(is as Routine["trigger"])}`;
    case "run":
      return runSentence(was as RoutineTarget, is as RoutineTarget);
    case "overlap":
      return `${label}: ${OVERLAP_WORDS[was as Routine["overlap"]]} → ${OVERLAP_WORDS[is as Routine["overlap"]]}`;
    case "catchUp":
      return `${label}: ${CATCH_UP_WORDS[was as Routine["catchUp"]]} → ${CATCH_UP_WORDS[is as Routine["catchUp"]]}`;
    case "name":
    case "version":
    case "id":
      return `${label}: ${String(was)} → ${String(is)}`;
    default:
      if (was === undefined) {
        return `${label} added`;
      }
      return is === undefined ? `${label} removed` : `${label} edited`;
  }
}

/** "Runs: workflow support-triage → agent finance", "Hub: a → b, prompt edited", "Prompt edited", "Workflow input edited". */
function runSentence(was: RoutineTarget, is: RoutineTarget): string {
  const target = targetName(is);
  if (targetName(was) !== target) {
    return `Runs: ${targetName(was)} → ${target}`;
  }
  const edited = "agent" in is ? "Prompt edited" : "Workflow input edited";
  if (was.hub === is.hub) {
    return edited;
  }
  const hub = `Hub: ${was.hub ?? "this hub"} → ${is.hub ?? "this hub"}`;
  const onlyHub = deepEqual({ ...was, hub: undefined }, { ...is, hub: undefined });
  return onlyHub ? hub : `${hub}, ${edited.toLowerCase()}`;
}

function targetName(target: RoutineTarget): string {
  return "agent" in target ? `agent ${target.agent}` : `workflow ${target.workflow}`;
}
