// The hosts the sheets of a workspace's runner connectors list (HAL-14300): the
// backend of each plugin installed in the profile, and each local integration
// in the workspace. `privacy.localOnly` counts them in `validate`, `run` and
// the run's connectors, so `local: true` never makes code that reaches an
// outside host count as local (requirement `workspace.local-only-sheet-hosts`).

import type { IntegrationHost, SheetHosts } from "@halonicjs/format";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { openPluginService } from "./plugin-host.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";
import { workspaceIntegrations } from "./workspace-trust.ts";

/**
 * The hosts of the installed plugins' backends and of the local
 * integrations in the workspace folder `root`. A plugin that can't be read
 * or checked, or has no backend, is left out, and so is every plugin when
 * the plugins folder can't be read: a connector to it then isn't local.
 *
 * @param root - the workspace folder, or a copy of it at a run's commit
 * @param shown - the folder as the user typed it, such as `./acme`
 *
 * @example
 * await loadWorkspace(store, { sheetHosts: await computerSheetHosts(dir.root, dir.shown) });
 */
export async function computerSheetHosts(
  root: string,
  shown: string,
  profile: ProfileEnvironment = nodeProfileEnvironment(),
): Promise<SheetHosts> {
  const integrations = await workspaceIntegrations(root, shown);
  return {
    plugins: await pluginHosts(profile),
    integrations: new Map(
      integrations.map((each) => [each.folder.replace(/^integrations\//, ""), each.sheet.hosts]),
    ),
  };
}

/** The `backend.hosts` of each installed plugin that was read and checked, by its id. */
async function pluginHosts(
  profile: ProfileEnvironment,
): Promise<Map<string, readonly IntegrationHost[]>> {
  const entries = await openPluginService({ profile })
    .load()
    .catch(() => []);
  const hosts = new Map<string, readonly IntegrationHost[]>();
  for (const entry of entries) {
    if (entry.status === "broken" || entry.plugin.backend === undefined) continue;
    hosts.set(entry.plugin.id, entry.plugin.backend.hosts);
  }
  return hosts;
}
