import { type HarnessBridge, harnessBridgeTokenHeader } from "@halonicjs/ports";
import { bridgeServerName } from "./app-server-events.ts";
import { codexRunTokenVariable } from "./environment.ts";

/** The file in `CODEX_HOME` that holds Codex's settings. */
export const codexConfigFile = "config.toml";

/** The name of the model provider that points Codex at the bridge, in {@link codexConfigFile}. */
export const bridgeProviderName = "halonic";

/**
 * Codex's settings in the agent's settings folder, which is its `CODEX_HOME`
 * (requirement `harness-codex.config`). The text doesn't depend on the run
 * or on where it runs, so two runs of one agent write the same file:
 *
 * - The model provider is the bridge's, with the OpenAI Responses API. Codex
 *   reads the run token from {@link codexRunTokenVariable} and sends it in
 *   the bridge's header. `requires_openai_auth` lets a person's own ChatGPT
 *   sign-in through to the bridge; without one, Codex sends no
 *   `Authorization` and the bridge uses Halonic's key.
 * - Codex's own sandbox is off (`danger-full-access`): Halonic's sandbox is
 *   already around it, and the two don't nest.
 * - Codex asks for an OK when it wants one (`on-request`); the harness turns
 *   the request into `approval.requested`.
 * - Web search is off, in a sandbox and on this computer alike (decision 7,
 *   HAL-2076): the agent reaches the web only through Halonic's tools, where
 *   trust and approvals apply.
 * - The bridge's MCP server, with the run token in the bridge's header.
 *
 * The bridge's address changes with each run, so it isn't here:
 * {@link codexConfigArgs} gives it on the command line.
 */
export function codexConfigText(): string {
  const tokenHeader = `{ ${tomlString(harnessBridgeTokenHeader)} = ${tomlString(codexRunTokenVariable)} }`;
  return [
    "# Written by Halonic before each run of this agent. Changes here are replaced.",
    `model_provider = ${tomlString(bridgeProviderName)}`,
    `sandbox_mode = "danger-full-access"`,
    `approval_policy = "on-request"`,
    `web_search = "disabled"`,
    "",
    `[model_providers.${bridgeProviderName}]`,
    `name = "Halonic bridge"`,
    `wire_api = "responses"`,
    "requires_openai_auth = true",
    `env_http_headers = ${tokenHeader}`,
    "",
    `[mcp_servers.${bridgeServerName}]`,
    `env_http_headers = ${tokenHeader}`,
    "",
  ].join("\n");
}

/**
 * The arguments that give `codex app-server` the run's bridge: the model
 * provider's address (`/v1`, where the bridge serves `POST /v1/responses`)
 * and the MCP server's (`/mcp`). Codex reads a provider's address only from
 * its settings, and `-c` sets a setting for this one process, so runs of
 * one agent never change each other's settings file. The address holds no
 * secret.
 *
 * @example
 * codexConfigArgs({ url: "http://127.0.0.1:4100", token });
 * // ["-c", 'model_providers.halonic.base_url="http://127.0.0.1:4100/v1"',
 * //  "-c", 'mcp_servers.halonic.url="http://127.0.0.1:4100/mcp"']
 */
export function codexConfigArgs(bridge: Pick<HarnessBridge, "url">): string[] {
  // An address that ends with "/" would otherwise give "//v1".
  const address = bridge.url.replace(/\/+$/, "");
  return [
    "-c",
    `model_providers.${bridgeProviderName}.base_url=${tomlString(`${address}/v1`)}`,
    "-c",
    `mcp_servers.${bridgeServerName}.url=${tomlString(`${address}/mcp`)}`,
  ];
}

/**
 * `value` as a TOML basic string. JSON's escapes are TOML's too, except that
 * TOML also escapes the delete character, and has no way to write half of a
 * surrogate pair.
 *
 * @throws Error when `value` holds half of a surrogate pair
 */
export function tomlString(value: string): string {
  if (!value.isWellFormed()) {
    throw new Error("A TOML string can't hold half of a surrogate pair.");
  }
  return JSON.stringify(value).replaceAll("\u007f", "\\u007F");
}
