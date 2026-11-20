import type { ServerResponse } from "node:http";
import { type HostRoute, sendError, sendErrorAndHangUp, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { isFromOtherSite } from "../server/other-site.ts";
import { PluginRefusal, sendRefusal } from "./plugin-refusal.ts";
import { handOverSecretsBody } from "./plugin-schemas.ts";
import type { PluginSecretValues } from "./plugin-secret-values.ts";
import type { PluginTable } from "./plugin-table.ts";

/** What the hand-over route reaches. */
export interface PluginSecretRouteDeps {
  plugins: PluginTable;
  values: PluginSecretValues;
  /** Where the host writes what failed; never a value. */
  log?: ((text: string) => void) | undefined;
}

/**
 * The route Studio hands a plugin's secrets over with, right before it asks
 * the host to use them (ADR 2026-11-19, "Studio hands a plugin its secrets").
 *
 * `POST /v1/plugins/secrets` with `{ plugin, secrets }`, each secret by the
 * name the plugin declares, answers `{ kept }`, the number kept. The host
 * checks its own trust record against the plugin's folder now, builds each
 * name it keeps the value under itself, `plugin__<id>__<secret>`, and
 * replaces what it held for the plugin; an empty `secrets` forgets them.
 *
 * It refuses, keeping nothing: a `Sec-Fetch-Site` other than `same-origin`
 * (403 `secret_from_other_site`, before the body is read); a body that
 * doesn't fit (400 `body_invalid`, with no detail, as it holds values); a
 * plugin the trust doesn't cover (403 `plugin_not_trusted`, and the values
 * held for it are dropped); a name the plugin doesn't declare (400
 * `secret_not_declared`); and the other refusals of a call, such as 503
 * `host_stopping` and 403 `not_in_this_build`.
 * No answer and no log line holds a value.
 */
export function pluginSecretRoutes(deps: PluginSecretRouteDeps): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/plugins/secrets",
      handle: async (request, response) => {
        if (isFromOtherSite(request)) {
          sendErrorAndHangUp(
            request,
            response,
            403,
            "secret_from_other_site",
            "The agent host takes a secret only from its own page.",
          );
          return;
        }
        const body = await readCheckedBody(request, response, handOverSecretsBody, {
          describeProblems: false,
        });
        if (body === undefined) return;
        try {
          sendHandOver(response, await handOver(deps, body.plugin, body.secrets));
        } catch (error) {
          sendFailure(deps, response, error);
        }
      },
    },
  ];
}

/** What a hand-over did: the number kept, or a name the plugin doesn't declare. */
type HandOver = { kept: number } | "not_declared";

/**
 * Checks the trust now and keeps the secrets under the plugin's own names,
 * replacing what was held for it; keeps none when one isn't declared.
 *
 * @throws PluginRefusal when the plugin may not have them
 */
async function handOver(
  deps: PluginSecretRouteDeps,
  plugin: string,
  secrets: Readonly<Record<string, string>>,
): Promise<HandOver> {
  const names = await deps.plugins.trustedSecretNames(plugin);
  const kept = new Map<string, string>();
  for (const [secret, value] of Object.entries(secrets)) {
    const name = Object.hasOwn(names, secret) ? names[secret] : undefined;
    if (name === undefined) return "not_declared";
    kept.set(name, value);
  }
  // The trust check waits, and the host may have stopped and cleared the values meanwhile.
  if (deps.plugins.isStopping) throw new PluginRefusal("host_stopping");
  deps.values.replace(plugin, kept);
  return { kept: kept.size };
}

function sendHandOver(response: ServerResponse, done: HandOver): void {
  if (done === "not_declared") {
    sendError(
      response,
      400,
      "secret_not_declared",
      "The plugin doesn't declare one of these secrets, so the host keeps none of them.",
    );
    return;
  }
  sendJson(response, 200, done);
}

/** The table already dropped what it held for a plugin the trust no longer covers. */
function sendFailure(deps: PluginSecretRouteDeps, response: ServerResponse, error: unknown): void {
  if (error instanceof PluginRefusal) {
    sendRefusal(response, error);
    return;
  }
  deps.log?.(`A plugin's secrets weren't kept (${errorName(error)}).\n`);
  sendError(response, 502, "plugin_failed", failedMessage);
}

const failedMessage = "The agent host couldn't keep the plugin's secrets. Its log has the detail.";

/** Only the error's name: its message could hold a path, never a value, but the log needs neither. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}
