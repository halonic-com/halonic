import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { PluginRefusal, sendRefusal } from "./plugin-refusal.ts";
import { callPluginBody } from "./plugin-schemas.ts";
import { pluginSecretRoutes } from "./plugin-secret-routes.ts";
import type { PluginSecretValues } from "./plugin-secret-values.ts";
import type { PluginTable } from "./plugin-table.ts";

/** What the plugin routes reach. */
export interface PluginRouteDeps {
  plugins: PluginTable;
  /** The secrets Studio hands over with `POST /v1/plugins/secrets` (`pluginSecretRoutes`). */
  secretValues: PluginSecretValues;
  /** Where the host writes what it keeps from a failure; the answer never carries it. */
  log?: (text: string) => void;
}

const pluginFailedMessage =
  "The plugin couldn't finish this call. The agent host's log has the detail.";

/**
 * The plugin tool calls of Studio's desktop app, over loopback. Plugin code
 * never runs in the page or in the host: the host runs a trusted plugin's
 * backend in a sandboxed runner of its own, and each local tool in a sandbox
 * session of its own.
 *
 * `POST /v1/plugins/call` with `{ plugin, tool, args }` answers `{ text }`.
 * The request names the plugin by id only: the host reads the plugin's
 * folder in its own profile and checks the trust record there itself, at
 * every call. It answers 403 `plugin_not_trusted` when the trust doesn't
 * cover the plugin as it is now, 403 `not_fenced` where no sandbox fences
 * the runner (nothing starts, with no fallback), 429 `too_many_plugins`
 * and 503 `host_stopping`. Any other failure answers 502 `plugin_failed`
 * with a fixed message: the error's own text can hold paths, so it goes only
 * to the host's log. A plugin the trust no longer covers also loses the
 * secrets Studio handed over for it.
 *
 * Beside it, `POST /v1/plugins/secrets` takes those secrets ({@link pluginSecretRoutes}).
 */
export function pluginRoutes(deps: PluginRouteDeps): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/plugins/call",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, callPluginBody);
        if (body === undefined) return;
        try {
          const text = await deps.plugins.call(body.plugin, body.tool, body.args);
          sendJson(response, 200, { text });
        } catch (error) {
          if (error instanceof PluginRefusal) {
            sendRefusal(response, error);
            return;
          }
          const name = error instanceof Error ? error.name : "Error";
          const detail = error instanceof Error ? error.message : String(error);
          deps.log?.(`A plugin call failed (${name}): ${detail}\n`);
          sendError(response, 502, "plugin_failed", pluginFailedMessage);
        }
      },
    },
    ...pluginSecretRoutes({ plugins: deps.plugins, values: deps.secretValues, log: deps.log }),
  ];
}
