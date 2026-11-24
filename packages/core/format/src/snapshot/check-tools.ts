import type { Path } from "@halonicjs/schema-kit";
import { checkTool } from "../kinds/tool/kind.ts";
import type { ToolEntry } from "../kinds/tool/schema.ts";
import type { KnownActions, SnapshotProblem } from "./schema.ts";

/** A tool and where it came from: its file when building, its place in the list when reading. */
export interface PlacedTool {
  readonly tool: ToolEntry;
  readonly file?: string;
  readonly path: Path;
}

/**
 * The checks that need the whole list or the runtime: each action must be
 * one Halonic has, each name must be used once, and each tool must pass
 * the tool file's own checks again, so a snapshot changed after it was
 * built is held to the same rules as the files.
 *
 * @param tools - the tools, with where each came from
 * @param actions - the actions the runtime can run
 * @returns every problem; empty when the tools may be served
 */
export function checkSnapshotTools(
  tools: readonly PlacedTool[],
  actions: KnownActions,
): SnapshotProblem[] {
  const problems: SnapshotProblem[] = [];
  const seen = new Set<string>();
  for (const { tool, file, path } of tools) {
    const where = file === undefined ? {} : { file };
    if (!actions.has(tool.action)) {
      problems.push({
        ...where,
        code: "tool-action-unknown",
        path: [...path, "action"],
        message: `This version of Halonic has no action "${tool.action}". Use one it lists, or update Halonic.`,
      });
    }
    if (seen.has(tool.name)) {
      problems.push({
        ...where,
        code: "tool-name-taken",
        path: [...path, "name"],
        message: `Another tool is already called "${tool.name}". Give each tool its own name.`,
      });
    }
    seen.add(tool.name);
    for (const problem of checkTool(tool)) {
      if (problem.severity === "error") {
        problems.push({
          ...where,
          code: problem.code,
          path: [...path, ...problem.path],
          message: problem.message,
        });
      }
    }
  }
  return problems;
}
