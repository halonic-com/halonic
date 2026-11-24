import { parse } from "@halonicjs/schema-kit";
import { err, ok, type Result } from "@halonicjs/std";
import { parseFile } from "../parse-file.ts";
import { checkSnapshotTools, type PlacedTool } from "./check-tools.ts";
import {
  type KnownActions,
  SNAPSHOT_FORMAT,
  type SnapshotProblem,
  WorkspaceSnapshot,
} from "./schema.ts";

/** A tool file as read from the workspace commit. */
export interface ToolFile {
  /** The file's path in the workspace, for messages. */
  readonly path: string;
  readonly text: string;
}

/** What a snapshot is built from. */
export interface SnapshotInput {
  /** The workspace commit the files were read from. */
  readonly commit: string;
  readonly toolFiles: readonly ToolFile[];
  /** The actions the runtime that will serve the snapshot can run. */
  readonly actions: KnownActions;
}

/**
 * Builds the snapshot of a workspace commit from its tool files. Every file
 * must pass: one bad file refuses the whole build and names every problem,
 * so a build never quietly leaves a tool out. A tool nobody may call is
 * kept, with no callers: it is off, not missing.
 *
 * The result doesn't depend on the order of the files, so the same commit
 * always gives the same snapshot; write it with `snapshotJson`.
 *
 * @param input - the commit, its tool files and the runtime's actions
 * @returns the snapshot, or every problem in every file
 */
export function buildSnapshot(input: SnapshotInput): Result<WorkspaceSnapshot, SnapshotProblem[]> {
  const problems: SnapshotProblem[] = [];
  const placed: PlacedTool[] = [];
  for (const file of input.toolFiles) {
    const parsed = parseFile("tool", file.text);
    if (!parsed.ok) {
      for (const { severity, code, path, message } of parsed.error) {
        if (severity === "error") {
          problems.push({ file: file.path, code, path, message });
        }
      }
      continue;
    }
    const { version: _version, ...tool } = parsed.value.value;
    placed.push({ tool, file: file.path, path: [] });
  }
  problems.push(...checkSnapshotTools(placed, input.actions));
  if (problems.length > 0) {
    return err(problems);
  }
  const tools = placed
    .map(({ tool }) => tool)
    .sort((left, right) => (left.name < right.name ? -1 : 1));
  // The finished snapshot passes the reader's schema too, so a build never
  // writes what a reader would refuse, such as a short commit id.
  const snapshot = parse(WorkspaceSnapshot, {
    snapshot: SNAPSHOT_FORMAT,
    commit: input.commit,
    tools,
  });
  if (!snapshot.ok) {
    return err(snapshot.error.map(({ code, path, message }) => ({ code, path, message })));
  }
  return ok(snapshot.value);
}
