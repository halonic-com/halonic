// The loader's part for a plugin's backend (plugins ADR sections 1.1 and 3,
// HAL-1737). A plugin's backend is a local integration: its sheet is the
// manifest's `backend` with the plugin's id, version and SDK, and it runs in
// the runner exactly as a local integration does, with no in-process path.
// Whether the person trusts the plugin is checked before every start, by the
// caller's `start` (`PluginBackendStart` in `core/app`, then the start gate).
// The folder is checked against the files that trust covered before every
// start too, so a change after the check is refused, not run.
// A plugin's code is never loaded on Halonic's side.

import type { LoadedIntegration, LoadProblem } from "@halonicjs/adapter-integration-kit";
import { backendSheet, type Plugin } from "@halonicjs/format";
import { err, type Result } from "@halonicjs/std";
import { type CheckedFile, type CheckedFilesDisk, checkedFilesProblems } from "./checked-files.ts";
import { type LoadLocalIntegrationOptions, loadLocalBackend } from "./local-integration.ts";

/** What {@link loadPluginBackend} needs: a local integration's options, with the plugin in place of the sheet. */
export interface LoadPluginBackendOptions
  extends Omit<LoadLocalIntegrationOptions, "sheet" | "approvedSheet"> {
  /**
   * The plugin as it was read and checked just now. Its `backend` gives the
   * sheet, so the sheet that is checked is the manifest that was trusted,
   * not a copy that could differ from it.
   */
  readonly plugin: Plugin;
  /**
   * The files the trust check covered, from `TrustedPluginBackend.files` in
   * `core/app`. Before every runner start, the folder must hold exactly
   * these files with these hashes; anything else stops that start.
   */
  readonly files: readonly CheckedFile[];
  /** The disk the files are on; this machine's unless a test passes another. */
  readonly filesDisk?: CheckedFilesDisk;
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
 * Every start, the first and each one after an idle stop, first checks the
 * folder against `files`, the files the person's trust covered.
 *
 * @example
 * const loaded = await loadPluginBackend({ plugin, files, folder, start, transport, secrets, tokens, choices });
 * if (loaded.ok) connections.set(id, loaded.value.integration.connect(loaded.value.host));
 *
 * @throws what `start` throws when the first runner doesn't start, or an
 *   error when the folder no longer matches `files` at a start
 */
export async function loadPluginBackend(
  options: LoadPluginBackendOptions,
): Promise<Result<LoadedIntegration, LoadProblem[]>> {
  const { plugin, files, filesDisk, start, ...rest } = options;
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
  const startChecked: typeof start = async (bridge) => {
    const problems = checkedFilesProblems(rest.folder, files, filesDisk);
    if (problems.length > 0) {
      throw new Error(
        `${plugin.id}: its folder is not what was trusted (${problems.join(", ")}); trust it again`,
      );
    }
    return await start(bridge);
  };
  return await loadLocalBackend({
    ...rest,
    sheet,
    approvedSheet: sheet,
    start: startChecked,
  });
}
