import type { RunEvent } from "./run-event.ts";

/**
 * The providers' notes on how they changed a run's model calls, each once
 * (requirement `events.provider-notes`): the `notes` of every
 * `llm.response`, in the order each note first came. A run whose calls all
 * left out the same setting says so once. Pure.
 *
 * @param events - the run's events, oldest first
 * @returns each note once; empty when no provider changed a call
 *
 * @example
 * providerNotes(events);
 * // three calls to claude-sonnet-5-5 with temperature set
 * // => ["Left out temperature: claude-sonnet-5-5 doesn't take it."]
 */
export function providerNotes(events: readonly RunEvent[]): string[] {
  const notes = new Set<string>();
  for (const event of events) {
    if (event.type !== "llm.response") continue;
    for (const note of event.notes ?? []) notes.add(note);
  }
  return [...notes];
}
