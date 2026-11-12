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

/**
 * The default deployment, when one is named, must be one of the listed ones,
 * and Cloudflare settings on another host are flagged as unused.
 */
function checkDeployments(file: Deployments): KindCheckProblem[] {
  return [...checkDefault(file), ...checkUnusedCloudflare(file)];
}

/** The default deployment, when one is named, must be one of the listed ones. */
function checkDefault(file: Deployments): KindCheckProblem[] {
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

/**
 * Cloudflare settings on a deployment that runs elsewhere are a warning, not
 * an error: moving a deployment to another host changes only `host:`, so the
 * settings may stay behind for the way back (ADR HAL-35, 2).
 */
function checkUnusedCloudflare(file: Deployments): KindCheckProblem[] {
  return Object.entries(file.deployments).flatMap(([id, deployment]) =>
    deployment.cloudflare === undefined || deployment.host === "cloudflare"
      ? []
      : [
          {
            severity: "warning" as const,
            code: "cloudflare-settings-unused",
            path: ["deployments", id, "cloudflare"],
            message: `Deployment "${id}" runs on host "${deployment.host}", so its cloudflare settings are not used`,
          },
        ],
  );
}
