import { type Path, parse } from "@halonicjs/schema-kit";
import { canonicalJson, err, ok, type Result } from "@halonicjs/std";
import { checkTool } from "../kinds/tool/checks.ts";
import type { Tool } from "../kinds/tool/schema.ts";
import { WorkspaceSnapshot } from "./schema.ts";

/**
 * Why a snapshot is refused. A refused snapshot is never used in part:
 * the plugin keeps the last good one, and the builder builds nothing.
 */
export interface SnapshotProblem {
  /** schema-kit's issue code, or the rule's name, such as `tool-name-twice`. */
  readonly code: string;
  /** Where in the snapshot, such as `["tools", 2, "name"]`. */
  readonly path: Path;
  /** What is wrong. It never repeats a value that looks like a key. */
  readonly message: string;
}

/** What a snapshot is made from: the workspace, its commit and its parsed tool files. */
export interface SnapshotInput {
  readonly name: string;
  readonly commit: string;
  readonly tools: readonly Tool[];
}

/** Each place where a name is used a second time, as `code` at `tools[i].<key>`. */
function repeated(tools: readonly Tool[], key: "name" | "id", code: string): SnapshotProblem[] {
  const seen = new Set<string>();
  return tools.flatMap((tool, index) => {
    if (!seen.has(tool[key])) {
      seen.add(tool[key]);
      return [];
    }
    return [
      {
        code,
        path: ["tools", index, key],
        message: `another tool already has the ${key} '${tool[key]}'`,
      },
    ];
  });
}

/** The first tool that is out of name order, so two equal snapshots are always written alike. */
function outOfOrder(tools: readonly Tool[]): SnapshotProblem[] {
  const index = tools.findIndex((tool, at) => at > 0 && (tools[at - 1]?.name ?? "") > tool.name);
  return index === -1
    ? []
    : [
        {
          code: "tools-not-sorted",
          path: ["tools", index],
          message: "list the tools sorted by name",
        },
      ];
}

/**
 * Reads a snapshot and runs every check a tool file gets, again: the
 * plugin's loader calls this on the snapshot built into it and on every
 * newer one it fetches, so a snapshot changed after the build is refused
 * the same way a tool file is. Nothing is filled in or left out: the
 * snapshot passes whole, or not at all.
 *
 * Refused besides the schema: a key in any text (`value-looks-like-key`),
 * a parameter that asks for a key (`parameter-asks-for-key`), an empty
 * number range (`parameter-range-empty`), a tool name or id used twice
 * (`tool-name-twice`, `tool-id-twice`) and tools out of name order
 * (`tools-not-sorted`).
 *
 * @param data - the snapshot as JSON data
 * @returns the snapshot, or every problem found
 *
 * @example
 * readSnapshot({ format: 1, workspace: { name: "Acme", commit: "ab…" }, tools: [] }); // ok
 */
export function readSnapshot(data: unknown): Result<WorkspaceSnapshot, SnapshotProblem[]> {
  const parsed = parse(WorkspaceSnapshot, data);
  if (!parsed.ok) {
    return err(parsed.error.map(({ code, path, message }) => ({ code, path, message })));
  }
  const { tools } = parsed.value;
  const problems: SnapshotProblem[] = [
    ...tools.flatMap((tool, index) =>
      checkTool(tool).map(({ code, path, message }) => ({
        code,
        path: ["tools", index, ...path],
        message,
      })),
    ),
    ...repeated(tools, "name", "tool-name-twice"),
    ...repeated(tools, "id", "tool-id-twice"),
    ...outOfOrder(tools),
  ];
  return problems.length > 0 ? err(problems) : ok(parsed.value);
}

/**
 * Makes the snapshot of one workspace commit from its parsed tool files,
 * sorted by name, and checks it with {@link readSnapshot}, so the builder
 * can't write a snapshot the plugin would refuse.
 *
 * @param input - the workspace's name, the commit and its tools
 * @returns the snapshot, or every problem found
 */
export function makeSnapshot(input: SnapshotInput): Result<WorkspaceSnapshot, SnapshotProblem[]> {
  const tools = [...input.tools].sort((first, second) =>
    first.name < second.name ? -1 : Number(first.name > second.name),
  );
  return readSnapshot({
    format: 1,
    workspace: { name: input.name, commit: input.commit },
    tools,
  });
}

/**
 * The snapshot as text in one canonical form (keys sorted, no spaces), so
 * the same workspace commit always gives the same bytes and checksum.
 *
 * @param snapshot - a snapshot that passed {@link readSnapshot}
 * @returns its canonical JSON text
 */
export function snapshotText(snapshot: WorkspaceSnapshot): string {
  return canonicalJson(snapshot);
}
