import type { FileKind } from "../../kind.ts";
import { checkTool } from "./checks.ts";
import { MAX_TOOL_FILE_BYTES, Tool } from "./schema.ts";

/**
 * `library/tools/<id>.tool.yaml`, at the workspace root only: a plugin is
 * built for a whole workspace, so its tools are the workspace's.
 */
export const toolKind: FileKind<Tool> = {
  name: "tool",
  about:
    "A tool the workspace offers its agents through a built plugin: its wording, parameters, callers and action.",
  syntax: "yaml",
  schema: Tool,
  places: [{ scope: "workspace", folder: "library/tools", name: "<id>.tool.yaml" }],
  idFromPlace: "fallback",
  maxBytes: MAX_TOOL_FILE_BYTES,
  check: checkTool,
};
