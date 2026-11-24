import { parse } from "@halonicjs/schema-kit";
import { canonicalJson, err, ok, type Result } from "@halonicjs/std";
import { checkSnapshotTools } from "./check-tools.ts";
import { type KnownActions, type SnapshotProblem, WorkspaceSnapshot } from "./schema.ts";

/**
 * Writes a snapshot as the one text it has: canonical JSON (keys sorted,
 * no spaces), the tools sorted by name, and a final line break. The same
 * snapshot always gives the same bytes, so its checksum can be compared.
 *
 * @example
 * snapshotJson({ snapshot: 1, commit: "…", tools: [] }); // '{"commit":"…","snapshot":1,"tools":[]}\n'
 */
export function snapshotJson(snapshot: WorkspaceSnapshot): string {
  const tools = [...snapshot.tools].sort((left, right) => byCodeUnit(left.name, right.name));
  return `${canonicalJson({ ...snapshot, tools })}\n`;
}

/**
 * Reads a snapshot an engine is about to serve, and refuses it unless
 * every rule holds: the schema with no unknown field, only actions this
 * Halonic has, each tool name once, no key in any field, and the text
 * written exactly as {@link snapshotJson} writes it. A refused snapshot is
 * served as nothing: the caller keeps its last good one.
 *
 * @param text - the snapshot file's text
 * @param actions - the actions the runtime can run
 * @returns the snapshot, or every problem found
 */
export function readSnapshot(
  text: string,
  actions: KnownActions,
): Result<WorkspaceSnapshot, SnapshotProblem[]> {
  const data = parseJson(text);
  if (!data.ok) {
    return data;
  }
  const parsed = parse(WorkspaceSnapshot, data.value);
  if (!parsed.ok) {
    return err(parsed.error.map(({ code, path, message }) => ({ code, path, message })));
  }
  const snapshot = parsed.value;
  const placed = snapshot.tools.map((tool, index) => ({ tool, path: ["tools", index] }));
  const problems = checkSnapshotTools(placed, actions);
  if (problems.length > 0) {
    return err(problems);
  }
  if (snapshotJson(snapshot) !== text) {
    return err([
      {
        code: "snapshot-not-canonical",
        path: [],
        message:
          "The snapshot isn't written the way Halonic writes it, so its checksum can't be trusted. Build it again.",
      },
    ]);
  }
  return ok(snapshot);
}

function parseJson(text: string): Result<unknown, SnapshotProblem[]> {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    return err([{ code: "snapshot-not-json", path: [], message: "The snapshot isn't JSON." }]);
  }
}

function byCodeUnit(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
