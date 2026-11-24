import { canonicalJson } from "@halonicjs/std";
import type { PluginSnapshot, SnapshotTool } from "./snapshot.ts";

/** One tool whose fields changed between two builds. */
export interface ChangedTool {
  /** The tool's name. */
  readonly tool: string;
  /** The fields that differ, added or removed ones included, sorted. */
  readonly fields: readonly string[];
}

/** What changed between two snapshots, each list sorted, for the release file. */
export interface ChangeList {
  /** Tools only the new snapshot has. */
  readonly added: readonly string[];
  /** Tools only the previous snapshot has. */
  readonly removed: readonly string[];
  /** Tools both have, whose fields differ. */
  readonly changed: readonly ChangedTool[];
}

/**
 * Compares a new snapshot with the previous build's. Without a previous
 * build every tool is added. Fields are compared as canonical JSON, so the
 * order of keys inside a field never counts as a change.
 *
 * @param previous - the previous build's snapshot, or `undefined` for a first build
 * @param current - the snapshot being built
 * @returns the added, removed and changed tools, each list sorted
 *
 * @example
 * changeList(undefined, { tools: [{ name: "pr_status" }] });
 * // { added: ["pr_status"], removed: [], changed: [] }
 */
export function changeList(
  previous: PluginSnapshot | undefined,
  current: PluginSnapshot,
): ChangeList {
  const before = byName(previous?.tools ?? []);
  const after = byName(current.tools);
  const added = [...after.keys()].filter((name) => !before.has(name));
  const removed = [...before.keys()].filter((name) => !after.has(name));
  const changed: ChangedTool[] = [];
  for (const [name, tool] of after) {
    const old = before.get(name);
    const fields = old === undefined ? [] : changedFields(old, tool);
    if (fields.length > 0) {
      changed.push({ tool: name, fields });
    }
  }
  return {
    added: added.sort(byCodeUnit),
    removed: removed.sort(byCodeUnit),
    changed: changed.sort((left, right) => byCodeUnit(left.tool, right.tool)),
  };
}

function byName(tools: readonly SnapshotTool[]): Map<string, SnapshotTool> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

function changedFields(before: SnapshotTool, after: SnapshotTool): string[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  names.delete("name");
  return [...names].filter((field) => !sameField(before[field], after[field])).sort(byCodeUnit);
}

function sameField(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return canonicalJson(left) === canonicalJson(right);
}

function byCodeUnit(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
