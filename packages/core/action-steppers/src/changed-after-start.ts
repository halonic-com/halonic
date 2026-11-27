import type { ActionKeptValue } from "@halonicjs/events";

/** The result of checking that a kept time is later than the stepper's start. */
export type ChangedAfterStartResult = { ok: true } | { ok: false; message: string };

// Only a full ISO 8601 instant with a zone, as GitHub writes `updated_at`:
// `Date.parse` alone would also take local times and loose formats.
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function instantOf(value: ActionKeptValue | undefined): number | undefined {
  if (typeof value !== "string" || !instantPattern.test(value)) return undefined;
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? undefined : instant;
}

/**
 * Checks that a `check` step's `changedAfterStart` field holds a time later
 * than `startedAt`, such as a secret's `updated_at` after the guided step
 * where the user set it by hand. `startedAt` must come from the shell's own
 * clock when the stepper opened, never from the request or the definition,
 * so a requester can't move it. It fails closed: a missing field, one that
 * isn't an ISO 8601 instant with a zone, or a time equal to the start fails.
 * Times compare as instants, so `+01:00` and `Z` forms compare correctly.
 *
 * @example
 * checkChangedAfterStart({ updated_at: "2026-11-27T09:00:05Z" }, "updated_at", "2026-11-27T09:00:00Z");
 * // => { ok: true }
 */
export function checkChangedAfterStart(
  kept: Readonly<Record<string, ActionKeptValue>>,
  field: string,
  startedAt: string,
): ChangedAfterStartResult {
  const start = instantOf(startedAt);
  if (start === undefined) return { ok: false, message: "The stepper's start time isn't valid." };
  const value = Object.hasOwn(kept, field) ? kept[field] : undefined;
  const changed = instantOf(value);
  if (changed === undefined) {
    return { ok: false, message: `The service gave no valid time in "${field}".` };
  }
  if (changed <= start) {
    return { ok: false, message: "It hasn't changed since this stepper opened." };
  }
  return { ok: true };
}
