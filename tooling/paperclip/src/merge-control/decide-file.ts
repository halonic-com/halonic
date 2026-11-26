import { pluginVersion } from "../plugin/version.ts";
import { decide } from "./decide.ts";
import { rulesHashPlaceholder } from "./rules-hash.ts";
import type { MergeSnapshot } from "./snapshot.ts";
import {
  type Decision,
  defaultSettings,
  emptyMergeState,
  type MergeSettings,
  type MergeState,
} from "./state.ts";

/**
 * The merge rules as one file the Merger loads (HAL-18337, plan step 4 on
 * HAL-17912): `build:plugin` bundles this module into
 * `dist/merge-control-decide-<version>-<hash>.js`, with nothing from Node in it.
 * The Merger keeps its own reads, writes and schedule; it hands each pass's
 * snapshot and state in as JSON and carries out the actions that come back,
 * so a rule fix reaches it with the next plugin version.
 */

/**
 * The shape of the call; a change that breaks the Merger's side raises it
 * (2: the `reopen` action, HAL-18470; 3: the `add-label` action and a
 * dequeue with an empty comment, which posts none, HAL-18506).
 */
export const decideFileFormat = 3;

/**
 * Which rules answered, for the Merger's log: `halonic.agent-tools@<version>+<hash>`.
 * One version holds many rule changes, so the hash names the exact file (Liam, HAL-18337).
 */
export const rulesVersion = `halonic.agent-tools@${pluginVersion}+${rulesHashPlaceholder}`;

/** One pass's input, plain JSON. */
export interface DecideFileInput {
  readonly snapshot: MergeSnapshot;
  /** The state the previous answer returned; null before the first pass. */
  readonly state: MergeState | null;
  /** Only the settings that differ from `defaultSettings`, such as the board's `fastTrackLabellers`. */
  readonly settings?: Partial<MergeSettings>;
  /** The pass's time, as an ISO string. */
  readonly now: string;
}

/** One pass's answer: `decide`'s actions, state and log, and which rules gave them. */
export interface DecideFileAnswer extends Decision {
  readonly rules: string;
  readonly format: typeof decideFileFormat;
}

const snapshotLists = [
  "queue",
  "pulls",
  "merged",
  "tasks",
  "groupRuns",
  "mergeGroupRuns",
  "queuedPullRuns",
  "mainRuns",
] as const;

/**
 * Runs one pass of the plugin's rules. It throws on input it can't trust
 * (a bad time, an unknown setting, a state of another version, a snapshot
 * missing a list), so the Merger falls back to its own rules for that pass
 * instead of acting on a guess.
 */
export function decidePass(input: DecideFileInput): DecideFileAnswer {
  const now = new Date(input.now);
  if (Number.isNaN(now.getTime())) {
    throw new Error(`merge rules: "now" isn't a time: ${JSON.stringify(input.now)}`);
  }
  // A state saved by older rules lacks the fields added since (such as
  // `labelNoopReopened`); fill them in, as `merge-control-job.ts` does.
  const state: MergeState = { ...emptyMergeState, ...input.state };
  if (state.version !== emptyMergeState.version) {
    throw new Error(
      `merge rules: state version ${String(state.version)}, expected ${emptyMergeState.version}`,
    );
  }
  const missing = snapshotLists.filter((key) => !Array.isArray(input.snapshot?.[key]));
  if (missing.length > 0) {
    throw new Error(`merge rules: the snapshot has no list ${missing.join(", ")}`);
  }
  const unknown = Object.keys(input.settings ?? {}).filter(
    (key) => !Object.hasOwn(defaultSettings, key),
  );
  if (unknown.length > 0) {
    throw new Error(`merge rules: unknown setting ${unknown.join(", ")}`);
  }
  const mistyped = Object.entries(input.settings ?? {}).filter(
    ([key, value]) => !sameKind(defaultSettings[key as keyof MergeSettings], value),
  );
  if (mistyped.length > 0) {
    throw new Error(
      `merge rules: setting of the wrong type ${mistyped.map(([key]) => key).join(", ")}`,
    );
  }
  const settings: MergeSettings = { ...defaultSettings, ...input.settings };
  return {
    ...decide(input.snapshot, state, settings, now),
    rules: rulesVersion,
    format: decideFileFormat,
  };
}

/** Whether `value` has the type of the default it replaces: a number, a string, or a list of strings. */
function sameKind(fallback: unknown, value: unknown): boolean {
  if (Array.isArray(fallback)) {
    return Array.isArray(value) && value.every((each) => typeof each === "string");
  }
  if (typeof fallback === "number") {
    return typeof value === "number" && !Number.isNaN(value);
  }
  return typeof value === typeof fallback;
}
