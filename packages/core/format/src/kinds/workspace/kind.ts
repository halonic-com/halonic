import type { FileKind } from "../../kind.ts";
import { WorkspaceSettings } from "./schema.ts";

/** `workspace.yaml` at the workspace root. */
export const workspaceKind: FileKind<WorkspaceSettings> = {
  name: "workspace",
  about: "The workspace's name, privacy, budget, defaults and assistant model.",
  syntax: "yaml",
  schema: WorkspaceSettings,
  places: [{ scope: "workspace", folder: "", name: "workspace.yaml" }],
  idFromPlace: "none",
};
