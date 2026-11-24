import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
import { MAX_TOOL_PARAMETERS, Tool, type ToolEntry } from "./schema.ts";

/**
 * A tool definition (`<name>.tool.yaml`). The snapshot builder reads these
 * files from a workspace commit, so the kind has no place in the loader's
 * layout yet; the builder names the folder.
 */
export const toolKind: FileKind<Tool> = {
  name: "tool",
  about: "A tool agents can call: its name, description, parameters, callers and action.",
  syntax: "yaml",
  schema: Tool,
  places: [],
  idFromPlace: "none",
  check: checkTool,
};

/**
 * The checks over several fields: callers given one way, a sane number of
 * parameters, choices only on text, and no key anywhere in the file. A
 * tool file is data that ships in a public plugin, so a key in any field,
 * a description included, fails it. The snapshot runs the same checks on
 * each tool it reads.
 */
export function checkTool(tool: ToolEntry): KindCheckProblem[] {
  const problems: KindCheckProblem[] = [];
  if (tool.callers.everyone && tool.callers.agents.length > 0) {
    problems.push({
      severity: "error",
      code: "tool-callers-both",
      path: ["callers"],
      message: "Give either everyone: true or a list of agents, not both.",
    });
  }
  const parameters = Object.entries(tool.parameters);
  if (parameters.length > MAX_TOOL_PARAMETERS) {
    problems.push({
      severity: "error",
      code: "tool-too-many-parameters",
      path: ["parameters"],
      message: `A tool takes at most ${MAX_TOOL_PARAMETERS} parameters.`,
    });
  }
  for (const [name, parameter] of parameters) {
    if (parameter.choices !== undefined && parameter.type !== "string") {
      problems.push({
        severity: "error",
        code: "tool-choices-not-text",
        path: ["parameters", name, "choices"],
        message: "Only a string parameter can have choices.",
      });
    }
  }
  problems.push(...checkKeysIn(tool, [], "setting"));
  return problems;
}
