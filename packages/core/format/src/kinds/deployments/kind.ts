import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { Deployments } from "./schema.ts";

/** `deployments.yaml` at the workspace root. */
export const deploymentsKind: FileKind<Deployments> = {
  name: "deployments",
  about: "The places the workspace runs, each with its own runtime data.",
  syntax: "yaml",
  schema: Deployments,
  places: [{ scope: "workspace", folder: "", name: "deployments.yaml" }],
  idFromPlace: "none",
  check: checkDeployments,
};

/** The default deployment, when one is named, must be one of the listed ones. */
function checkDeployments(file: Deployments): KindCheckProblem[] {
  if (file.default === undefined || Object.hasOwn(file.deployments, file.default)) {
    return [];
  }
  return [
    {
      severity: "error",
      code: "default-deployment-not-listed",
      path: ["default"],
      message: `The default deployment "${file.default}" is not listed`,
    },
  ];
}
