// The loader's part for a plugin's backend (plugins ADR sections 1.1 and 3,
// HAL-1737). A plugin's backend is a local integration: its sheet is the
// manifest's `backend` with the plugin's id, version and SDK, and it runs in
// the runner exactly as a local integration does, with no in-process path.
// Whether the person trusts the plugin is checked before every start, by the
// caller's `start` (`PluginBackendStart` in `core/app`, then the start gate).
// A plugin's code is never loaded on Halonic's side.

import type { LoadedIntegration, LoadProblem } from "@halonicjs/adapter-integration-kit";
import { backendSheet, type Plugin } from "@halonicjs/format";
import { err, type Result } from "@halonicjs/std";
import { type LoadLocalIntegrationOptions, loadLocalIntegration } from "./local-integration.ts";

/** What {@link loadPluginBackend} needs: a local integration's options, with the plugin in place of the sheet. */
export interface LoadPluginBackendOptions
  extends Omit<LoadLocalIntegrationOptions, "sheet" | "approvedSheet" | "plugin"> {
  /**
   * The plugin as it was read and checked just now. Its `backend` gives the
   * sheet, so the sheet that is checked is the manifest that was trusted,
   * not a copy that could differ from it.
   */
  readonly plugin: Plugin;
}

/**
 * Loads a plugin's backend into the runner, as {@link loadLocalIntegration}
 * does for a local integration: the sheet and the person's choices are
 * checked first (a backend that declares `tokens` is refused), then the
 * folder's links, and only then does a runner start; its declaration must
 * match the sheet, or it is stopped and nothing is offered.
 *
 * @param options.choices - from `pluginBackendChoices` in `core/app`
 *
 * @example
 * const loaded = await loadPluginBackend({ plugin, folder, start, transport, secrets, tokens, choices });
 * if (loaded.ok) connections.set(id, loaded.value.integration.connect(loaded.value.host));
 *
 * @throws what `start` throws when the first runner doesn't start
 */
export async function loadPluginBackend(
  options: LoadPluginBackendOptions,
): Promise<Result<LoadedIntegration, LoadProblem[]>> {
  const { plugin, ...rest } = options;
  const sheet = backendSheet(plugin);
  if (sheet === undefined) {
    return err([
      {
        code: "no-backend",
        path: ["backend"],
        message: `${plugin.id}: the plugin has no backend to load`,
      },
    ]);
  }
  return await loadLocalIntegration({ ...rest, sheet, approvedSheet: sheet, plugin: true });
}
