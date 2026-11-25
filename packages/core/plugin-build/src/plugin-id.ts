// The plugin id becomes part of two file names (the archive and the release
// file), so nothing from the workspace may reach a path unless it passes this
// one strict pattern (Liam's condition on HAL-17985).

import { err, ok, type Result } from "@halonicjs/std";

/** The prefix every plugin id built from a workspace starts with. */
export const pluginIdPrefix = "halonic-ws.";

/**
 * A plugin id: `halonic-ws.`, then a lowercase letter or digit, then up to 62
 * lowercase letters, digits or hyphens. No dots, slashes or spaces, so it is
 * safe as part of a file name.
 */
export const pluginIdPattern = /^halonic-ws\.[a-z0-9][a-z0-9-]{0,62}$/;

/** Why a workspace name gives no plugin id. */
export interface PluginIdProblem {
  readonly code: "bad-plugin-id";
  /** The id the workspace name would have given. */
  readonly pluginId: string;
}

/**
 * Builds the plugin id from a workspace's name, `halonic-ws.<name>`, and
 * refuses any name that would give an id outside {@link pluginIdPattern}.
 * The name is never changed to make it fit: a refusal is clearer than an id
 * the user didn't choose.
 *
 * @param workspaceName - the workspace's name, such as `acme`
 * @returns the plugin id, or the problem with the id it would have been
 *
 * @example
 * pluginIdFor("acme"); // ok("halonic-ws.acme")
 * pluginIdFor("../acme"); // err({ code: "bad-plugin-id", pluginId: "halonic-ws.../acme" })
 */
export function pluginIdFor(workspaceName: string): Result<string, PluginIdProblem> {
  const pluginId = `${pluginIdPrefix}${workspaceName}`;
  if (!isPluginId(pluginId)) {
    return err({ code: "bad-plugin-id", pluginId });
  }
  return ok(pluginId);
}

/**
 * Whether a text is a plugin id that {@link pluginIdFor} could have built.
 *
 * @example
 * isPluginId("halonic-ws.acme"); // true
 * isPluginId("halonic-ws.Acme"); // false
 */
export function isPluginId(text: string): boolean {
  return pluginIdPattern.test(text);
}

/**
 * The archive's file name for a plugin id and version, such as
 * `halonic-ws.acme-0.3.0.tar`. Both parts must already be checked.
 */
export function archiveFileName(pluginId: string, version: string): string {
  return `${pluginId}-${version}.tar`;
}

/**
 * The release file's name for a plugin id and version, such as
 * `halonic-ws.acme-0.3.0.release.json`. Both parts must already be checked.
 */
export function releaseFileName(pluginId: string, version: string): string {
  return `${pluginId}-${version}.release.json`;
}
