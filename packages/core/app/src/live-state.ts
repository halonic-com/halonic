// Whether an item's saved file is what runs (save model 2.4–2.5, HAL-3246):
// what the Studio shows as "Changes not live yet" or "Runs the live version
// from 10:42", and what "Make live and run" is offered for.

import { type KindName, parseFile } from "@halonicjs/format";
import type { DefinitionSource, Vcs } from "@halonicjs/ports";
import { deepEqual } from "@halonicjs/std";
import { placeOf } from "@halonicjs/workspace";
import type { LiveVersion } from "./live-version.ts";

/**
 * An item's live state:
 * - `never-versioned`: the live version doesn't have the item, so runs
 *   other than Try it and Test can't start it;
 * - `live`: the saved item is the live one;
 * - `not-live`: the saved item differs from the live one; `since` is the
 *   date of the live version, which runs keep reading until a new one.
 */
export type LiveState =
  | { readonly state: "never-versioned" }
  | { readonly state: "live" }
  | { readonly state: "not-live"; readonly since: string };

/**
 * The fields of a kind whose saved value counts at once, without a new
 * version (engine answer point 4, HAL-3267): turning a routine off stops it
 * straight away. A saved change to one of them alone leaves the item live.
 */
export const actsAtOnce: Readonly<Partial<Record<KindName, readonly string[]>>> = {
  routine: ["enabled"],
};

/** What {@link liveState} reads: the live version, its files, and the saved files. */
export interface LiveStateInput {
  /** The live version, as `liveVersionOf` found it. */
  readonly live: LiveVersion;
  /** Reads the live version's files. */
  readonly vcs: Pick<Vcs, "readAt">;
  /** The saved files. */
  readonly saved: DefinitionSource;
}

/**
 * The live state of the item at `path` (requirement `app.live-state`). It
 * compares the item as its kind parses it, so a change to comments or
 * layout alone leaves it live, and leaves out the kind's
 * {@link actsAtOnce} fields. A file that doesn't parse on either side, or
 * isn't an item, is compared as text. With history off, every item is
 * live: runs read the saved files.
 *
 * @throws RangeError for a path the `DefinitionSource` port refuses
 *
 * @example
 * const live = await liveVersionOf(vcs);
 * const state = await liveState({ live, vcs, saved: store }, "agents/briefing.agent.yaml");
 * if (state.state === "not-live") show("Changes not live yet");
 */
export async function liveState(input: LiveStateInput, path: string): Promise<LiveState> {
  // Read first in every case, so the port refuses an unsafe or private path
  // the same way with history on or off.
  const savedText = await input.saved.read(path);
  const { live } = input;
  if (live.kind === "history-off") {
    return { state: "live" };
  }
  if (live.kind === "none-yet") {
    return { state: "never-versioned" };
  }
  const liveText = await input.vcs.readAt(live.commit.hash, path);
  if (liveText === null) {
    return { state: "never-versioned" };
  }
  if (savedText !== null && sameItem(path, savedText, liveText)) {
    return { state: "live" };
  }
  return { state: "not-live", since: live.commit.date };
}

/** Whether two texts of the file at `path` give the same item, its acts-at-once fields aside. */
function sameItem(path: string, first: string, second: string): boolean {
  if (first === second) {
    return true;
  }
  const place = placeOf(path);
  if (place === undefined) {
    return false;
  }
  const options = place.placeId === undefined ? {} : { id: place.placeId };
  const parsedFirst = parseFile(place.kind, first, options);
  const parsedSecond = parseFile(place.kind, second, options);
  if (!(parsedFirst.ok && parsedSecond.ok)) {
    return false;
  }
  const ignored = actsAtOnce[place.kind] ?? [];
  return deepEqual(
    withoutFields(parsedFirst.value.value, ignored),
    withoutFields(parsedSecond.value.value, ignored),
  );
}

/** The value without the named top-level fields. */
function withoutFields(value: unknown, fields: readonly string[]): unknown {
  if (fields.length === 0 || typeof value !== "object" || value === null) {
    return value;
  }
  const copy: Record<string, unknown> = { ...value };
  for (const field of fields) {
    delete copy[field];
  }
  return copy;
}
