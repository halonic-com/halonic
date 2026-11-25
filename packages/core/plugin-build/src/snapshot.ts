// A local, minimal snapshot type: only what the change list needs. The real
// snapshot schema comes with 1a-1 (HAL-17948); once it is on `main`, this file
// takes its type instead and keeps the untrusted-input check below.

import { MAX_SNAPSHOT_SIGNALS, Routing } from "@halonicjs/format";
import { s } from "@halonicjs/schema-kit";

/** The most tools a snapshot read back from an earlier build may hold. */
export const maxSnapshotTools = 1000;

/** The longest tool name a snapshot read back from an earlier build may hold. */
export const maxToolNameLength = 128;

/** One tool in a snapshot: its name and its other fields, as plain JSON data. */
export interface SnapshotTool {
  /** The tool's name, unique in its snapshot. */
  readonly name: string;
  /** Every other field, such as `description` or `parameters`. */
  readonly [field: string]: unknown;
}

/** The most signals a snapshot read back from an earlier build may hold, as the snapshot allows. */
export const maxSnapshotSignals = MAX_SNAPSHOT_SIGNALS;

/** A signal id: the format's id pattern, as long as a tool name. The release file needs the same. */
export const signalIdPattern = /^[a-z0-9][a-z0-9-_]{0,127}$/;

/** One signal in a snapshot: its id and its other fields, as plain JSON data. */
export interface SnapshotSignal {
  /** The signal's id, unique in its snapshot. */
  readonly id: string;
  /** Every other field, such as `rule` or `dryRun`. */
  readonly [field: string]: unknown;
}

/** What a build serves, as data: its tools and, when it has them, its signals and routing. */
export interface PluginSnapshot {
  /** The tools the plugin serves. */
  readonly tools: readonly SnapshotTool[];
  /** The signals the plugin switches on; none in a build without signal files. */
  readonly signals?: readonly SnapshotSignal[] | undefined;
  /** Who covers each role and who owns each area; none in a build without `routing.yaml`. */
  readonly routing?: Routing | undefined;
}

/**
 * The check for a snapshot read back from an earlier build, which is
 * untrusted data. `parse` also refuses input nested deeper than
 * `MAX_DEPTH`, so a hostile file can't overflow the stack later on.
 */
export const untrustedSnapshot = s
  .object({
    tools: s
      .array(s.object({ name: s.string().min(1).max(maxToolNameLength) }).passthrough())
      .max(maxSnapshotTools)
      .superRefine((tools, context) => {
        const names = tools.map((tool) => tool.name);
        const duplicate = names.find((name, index) => names.indexOf(name) !== index);
        if (duplicate !== undefined) {
          context.addIssue({ code: "custom", message: `The tool "${duplicate}" comes twice.` });
        }
      }),
    // Only the ids are checked: the change list compares each signal as canonical JSON, and a
    // previous build's rule settings may be of an older Halonic. An id must fit the release file.
    signals: s
      .array(s.object({ id: s.string().regex(signalIdPattern) }).passthrough())
      .max(maxSnapshotSignals)
      .superRefine((signals, context) => {
        const ids = signals.map((signal) => signal.id);
        const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
        if (duplicate !== undefined) {
          context.addIssue({ code: "custom", message: `The signal "${duplicate}" comes twice.` });
        }
      })
      .optional(),
    // Checked like the snapshot's own routing, so the change list compares agent names only.
    routing: Routing.optional(),
  })
  .passthrough();
