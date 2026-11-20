import type { Secrets } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { AnthropicReplyReader } from "./anthropic-reply.ts";
import { refuseUrlSources } from "./anthropic-sources.ts";
import { type KnownRequest, refuseUnknownAtCompatible } from "./compatible-request.ts";
import { type Fetch, passThrough, pickHeaders, type UpstreamLimits } from "./pass-through.ts";
import { type ProviderApi, providerTarget } from "./provider-address.ts";
import { providerAccess, providerAuthorization } from "./provider-key.ts";
import {
  type ProviderReach,
  parseModelRequest,
  removedEveryTool,
  type ToolsAfterRemoval,
  withoutProviderReach,
} from "./provider-reach.ts";
import type { BridgeRoute } from "./route.ts";
import { readModelCall, recordModelCall } from "./spend.ts";

/** The one host the bridge sends Anthropic requests to. */
export const anthropicOrigin = "https://api.anthropic.com";

/**
 * Where Messages calls go: `/v1/messages` at Anthropic, or under a
 * compatible provider's `baseUrl`, as the built-in loop's Anthropic provider
 * builds it, so `https://api.z.ai/api/anthropic` gets
 * `https://api.z.ai/api/anthropic/v1/messages` and a `baseUrl` that already
 * ends in `/v1` doesn't get it twice.
 */
const anthropicApi: ProviderApi = {
  name: "Anthropic",
  ownOrigin: anthropicOrigin,
  ownPath: "/v1/messages",
  pathUnder: (basePath) => `${basePath.replace(/\/v1$/, "")}/v1/messages`,
};

/**
 * What a compatible provider is sent of a Messages request: the top-level
 * fields Anthropic's reference names, except `container`, which runs code on
 * the provider's side (`mcp_servers` is known, and removed as at Anthropic),
 * and only the tools the program runs itself: a tool without a `type` or of the
 * type `custom`, and Anthropic's client tools (`bash_*`, `text_editor_*`,
 * `computer_*`, `memory_*`).
 */
const anthropicKnown: KnownRequest = {
  name: "Anthropic",
  fields: new Set([
    "cache_control",
    "context_management",
    "diagnostics",
    "fallbacks",
    "inference_geo",
    "max_tokens",
    "mcp_servers",
    "messages",
    "metadata",
    "model",
    "output_config",
    "output_format",
    "service_tier",
    "speed",
    "stop_sequences",
    "stream",
    "system",
    "temperature",
    "thinking",
    "tool_choice",
    "tools",
    "top_k",
    "top_p",
  ]),
  isProgramTool: (type) =>
    type === undefined ||
    type === "custom" ||
    (typeof type === "string" && /^(bash|text_editor|computer|memory)_/.test(type)),
  isKnownToolChoice: (choice) =>
    isPlainObject(choice) && ["auto", "any", "tool", "none"].includes(String(choice["type"])),
};

/** The request headers that go on to Anthropic. The program's key and the run token stay behind. */
const forwardedRequestHeaders = ["accept", "anthropic-beta", "anthropic-version", "content-type"];

/** Anthropic's reply headers the program reads: the body's type, the request id, and when to try again. */
function isForwardedReplyHeader(name: string): boolean {
  return (
    ["content-type", "request-id", "retry-after", "x-should-retry"].includes(name) ||
    name.startsWith("anthropic-ratelimit-")
  );
}

/**
 * A `tool_choice` once the removed tools are gone. Anthropic names a forced
 * tool by its `name`, as in `{ "type": "tool", "name": "web_search" }`, so a
 * choice of a removed tool's name becomes `{ "type": "auto" }`, keeping its
 * other fields, such as `disable_parallel_tool_use`. When a kept tool has the
 * same name, the choice stays as it is. A choice of `{ "type": "any" }`, which
 * forces some tool, becomes `auto` the same way when no tool is left.
 */
function anthropicToolChoice(choice: unknown, tools: ToolsAfterRemoval): unknown {
  if (!isPlainObject(choice)) return choice;
  if (choice["type"] === "any") {
    return removedEveryTool(tools) ? { ...choice, type: "auto" } : choice;
  }
  if (choice["type"] !== "tool") return choice;
  const name = choice["name"];
  const hasName = (tool: unknown) => isPlainObject(tool) && tool["name"] === name;
  if (!tools.removed.some(hasName) || tools.kept.some(hasName)) return choice;
  const { name: _removedName, ...rest } = choice;
  return { ...rest, type: "auto" };
}

/**
 * What an Anthropic request may not ask Anthropic to reach on its own: the
 * server tools that reach the web, such as `web_search_20250305` and
 * `web_fetch_20250910`, and the MCP connector's `mcp_servers`.
 */
const anthropicReach: ProviderReach = {
  isRemovedTool: (type) => type.startsWith("web_search_") || type.startsWith("web_fetch_"),
  removedFields: ["mcp_servers"],
  keptToolChoice: anthropicToolChoice,
};

/** What the Anthropic route needs from outside the bridge. */
export interface AnthropicRouteDependencies {
  secrets: Secrets;
  fetch: Fetch;
  /** Reaches a compatible provider at its file's `baseUrl`; left out, such calls are refused. */
  compatibleFetch?: Fetch | undefined;
  limits: UpstreamLimits;
}

/**
 * `POST /v1/messages`, as Claude Code sends it, passed on to
 * `api.anthropic.com`, or to the one compatible provider the agent's key
 * names (requirement `harness-bridge.provider-base-url`), with the agent's key in place of the program's
 * (requirement `harness-bridge.anthropic`), or with the program's own
 * sign-in for an agent on a subscription (requirement
 * `harness-bridge.sign-in`). Streaming replies stream through unchanged.
 * Anthropic's web tools and MCP servers are removed first, and a
 * `tool_choice` that forces a removed tool, or forces some tool when none
 * is left, becomes `auto`; image
 * and PDF blocks go on as they are, and one with a URL source is refused.
 * Each call is recorded with its usage and cost (requirement
 * `harness-bridge.spend`).
 */
export function anthropicRoute(dependencies: AnthropicRouteDependencies): BridgeRoute {
  return {
    method: "POST",
    path: "/v1/messages",
    handle: async (context) => {
      const access = providerAccess(context, "anthropic");
      // Keep the program's query, such as Claude Code's `?beta=true`.
      const { search } = new URL(context.request.url ?? "", anthropicOrigin);
      // Before the key is read, so an address the bridge refuses never reads it.
      const target = providerTarget(access, anthropicApi, search, dependencies);
      const authorization = await providerAuthorization(
        context,
        dependencies.secrets,
        "anthropic",
        (key) => ({ "x-api-key": key }),
      );
      const sent = await context.readBody();
      const request = parseModelRequest(sent);
      refuseUrlSources(request);
      if (target.atCompatibleProvider) refuseUnknownAtCompatible(request, anthropicKnown);
      const call = readModelCall("anthropic", request, "messages");
      const body = withoutProviderReach(request, anthropicReach);
      const headers = pickHeaders(context.request.headers, forwardedRequestHeaders);
      const reply = new AnthropicReplyReader();
      await recordModelCall(context.run, call, reply, () =>
        passThrough(
          context,
          {
            provider: "Anthropic",
            url: target.url,
            headers: { ...headers, ...authorization },
            body,
            replyHeader: isForwardedReplyHeader,
            watch: reply,
          },
          { fetch: target.fetch, limits: dependencies.limits },
        ),
      );
    },
  };
}
