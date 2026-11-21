// The hosts the sheets of a workspace's runner connectors list (HAL-14300): the
// backend and local tools of each plugin installed in the profile (HAL-15094),
// and each local integration in the workspace. `privacy.localOnly` counts them in `validate`, `run` and
// the run's connectors, so `local: true` never makes code that reaches an
// outside host count as local (requirement `workspace.local-only-sheet-hosts`).
// The trust check shows a plugin connector's hosts from the same list (HAL-14860).

import { readIntegrationSheets } from "@halonicjs/app";
import {
  type IntegrationHost,
  type IntegrationSheet,
  pluginHosts,
  type SheetHosts,
} from "@halonicjs/format";
import type { DefinitionSource } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { openPluginService } from "./plugin-host.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";
import { workspaceIntegrations } from "./workspace-trust.ts";

/** The hosts each installed plugin may reach, its backend's and its local tools', by the plugin's id. */
export type PluginHosts = SheetHosts["plugins"];

/**
 * The hosts of the installed plugins and of the local integrations in the
 * workspace folder `root`. A plugin that can't be read or checked is left
 * out, and so is every plugin when the plugins folder can't be read: a
 * connector to it then isn't local.
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
  return { plugins: await installedPluginHosts(profile), integrations: byFolder(integrations) };
}

/**
 * As {@link computerSheetHosts}, with the local integrations' sheets read
 * from `source`, the files a run reads, such as the live version (HAL-14860).
 * So `run` refuses before trust what its run connectors would leave out,
 * even when a sheet was changed and saved but not made live.
 *
 * @example
 * await loadWorkspace(picked.source, { sheetHosts: await versionSheetHosts(picked.source) });
 */
export async function versionSheetHosts(
  source: DefinitionSource,
  profile: ProfileEnvironment = nodeProfileEnvironment(),
): Promise<SheetHosts> {
  const integrations = await readIntegrationSheets(source);
  return { plugins: await installedPluginHosts(profile), integrations: byFolder(integrations) };
}

/**
 * The hosts each installed plugin that was read and checked may reach, as
 * `pluginHosts` gives them, by its id; none when the plugins folder can't be
 * read. A plugin with only local tools is in it too, so one that reaches
 * nothing counts as local.
 */
export async function installedPluginHosts(
  profile: ProfileEnvironment = nodeProfileEnvironment(),
): Promise<PluginHosts> {
  const entries = await openPluginService({ profile })
    .load()
    .catch(() => []);
  const hosts = new Map<string, readonly IntegrationHost[]>();
  for (const entry of entries) {
    if (entry.status === "broken") continue;
    hosts.set(entry.plugin.id, pluginHosts(entry.plugin));
  }
  return hosts;
}

/** Each integration's sheet hosts, by its folder's name under `integrations/`. */
function byFolder(
  integrations: readonly { readonly folder: string; readonly sheet: IntegrationSheet }[],
): Map<string, readonly IntegrationHost[]> {
  return new Map(
    integrations.map((each) => [each.folder.replace(/^integrations\//, ""), each.sheet.hosts]),
  );
}
