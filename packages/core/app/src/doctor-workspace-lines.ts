// The lines of `halonic doctor` that only a workspace has, from what the
// doctor service's checks found: Workspace, Models, Secrets and Plugins.
// Apart from the service, so it stays one file a person can read.

import { type WorkspaceLine, workspaceLine } from "./doctor-lines.ts";
import { pluginsLine } from "./doctor-plugins-line.ts";
import { type SecretsFound, secretsLine } from "./doctor-secrets-line.ts";
import type { DoctorReport, DoctorWorkspace } from "./doctor-service.ts";
import { lineOf, type timedOut } from "./doctor-time-limit.ts";
import { workspaceModels } from "./doctor-workspace-models.ts";
import type { Resources } from "./resource-report.ts";
import type { TrustCheck } from "./trust-service.ts";

/** What the checks a workspace's lines are made of found, each as it answered or ran over. */
export interface WorkspaceFound {
  trust: TrustCheck["status"] | null | typeof timedOut;
  resources: Resources | typeof timedOut;
  keys: ReadonlyMap<string, boolean | "unreadable"> | typeof timedOut;
  secrets: SecretsFound | typeof timedOut;
}

/**
 * The lines only a workspace has: Workspace, then Models, Secrets and
 * Plugins (`app.doctor-plugins`) when they apply.
 *
 * @example
 * workspaceLines(workspace, { trust: "trusted", resources, keys, secrets });
 * // { workspace: { check: "workspace", status: "ok", … }, plugins: { check: "plugins", … } }
 */
export function workspaceLines(
  workspace: DoctorWorkspace,
  found: WorkspaceFound,
): Pick<DoctorReport, "workspace" | "models" | "secrets" | "plugins"> {
  const lines: Pick<DoctorReport, "workspace" | "models" | "secrets" | "plugins"> = {
    workspace: lineOf(found.trust, "workspace", (trust) => trustLine(workspace, trust)),
  };
  const models = workspaceModels(workspace, found.resources, found.keys);
  if (models !== undefined) lines.models = models;
  const secrets = lineOf(found.secrets, "secrets", secretsLine);
  if (secrets !== undefined) lines.secrets = secrets;
  const plugins = pluginsLine(workspace.pluginProblems ?? []);
  if (plugins !== undefined) lines.plugins = plugins;
  return lines;
}

/** The Workspace line by the trust check's status, or ✓ when it wasn't read. */
function trustLine(workspace: DoctorWorkspace, trust: TrustCheck["status"] | null): WorkspaceLine {
  return workspaceLine(workspace.name, trust ?? "not-needed", {
    windowsDrive: workspace.windowsDrive,
    fileProblems: workspace.fileProblems,
    tooManyFilesToWatch: workspace.tooManyFilesToWatch,
  });
}
