import type { Secrets } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { type KnownRequest, refuseUnknownAtCompatible } from "./compatible-request.ts";
import { refuseModelsNotGiven } from "./keyed-model.ts";
import { OpenAiReplyReader } from "./openai-reply.ts";
import { refuseStoredPrompt, refuseUrlInputs } from "./openai-sources.ts";
import { type Fetch, passThrough, pickHeaders, type UpstreamLimits } from "./pass-through.ts";
import { type ProviderApi, providerTarget } from "./provider-address.ts";
import { providerAccess, providerAuthorization } from "./provider-key.ts";
import {
  hasRemovedType,
  type ProviderReach,
  parseModelRequest,
  removedEveryTool,
  type ToolsAfterRemoval,
  withoutProviderReach,
} from "./provider-reach.ts";
import type { BridgeRoute } from "./route.ts";
import { readModelCall, recordModelCall } from "./spend.ts";

/** The one host the bridge sends OpenAI requests to. */
export const openAiOrigin = "https://api.openai.com";

/**
 * Where Responses calls go: `/v1/responses` at OpenAI, or `/responses`
 * under a compatible provider's `baseUrl`, which names the API's version
 * itself, as in `https://openrouter.ai/api/v1`.
 */
const openAiApi: ProviderApi = {
  name: "OpenAI",
  ownOrigin: openAiOrigin,
  ownPath: "/v1/responses",
  pathUnder: (basePath) => `${basePath}/responses`,
};

/** The Responses tool types the program runs itself; OpenAI runs every other one on its side. */
const programToolTypes = ["custom", "function", "local_shell"];

/**
 * What a compatible provider is sent of a Responses request: the top-level
 * fields OpenAI's reference names, and only the tools the program runs
 * itself. A `tool_choice` is `auto`, `none` or `required`, one of those
 * tools, or an `allowed_tools` list of them.
 */
const openAiKnown: KnownRequest = {
  name: "OpenAI",
  fields: new Set([
    "background",
    "conversation",
    "include",
    "input",
    "instructions",
    "max_output_tokens",
    "max_tool_calls",
    "metadata",
    "model",
    "parallel_tool_calls",
    "previous_response_id",
    "prompt",
    "prompt_cache_key",
    "prompt_cache_retention",
    "reasoning",
    "safety_identifier",
    "service_tier",
    "store",
    "stream",
    "stream_options",
    "temperature",
    "text",
    "tool_choice",
    "tools",
    "top_logprobs",
    "top_p",
    "truncation",
    "user",
  ]),
  isProgramTool: (type) => typeof type === "string" && programToolTypes.includes(type),
  isKnownToolChoice: isKnownOpenAiToolChoice,
};

/** True for a Responses `tool_choice` that names no tool the provider runs itself. */
function isKnownOpenAiToolChoice(choice: unknown): boolean {
  if (typeof choice === "string") return ["auto", "none", "required"].includes(choice);
  if (!isPlainObject(choice)) return false;
  const type = choice["type"];
  if (type !== "allowed_tools") return openAiKnown.isProgramTool(type);
  const allowed = choice["tools"];
  return (
    Array.isArray(allowed) &&
    allowed.every((tool) => isPlainObject(tool) && openAiKnown.isProgramTool(tool["type"]))
  );
}

/**
 * The request headers that go on to OpenAI. The program's key, its
 * organization and project (which belong with that key) and the run token
 * stay behind.
 */
const forwardedRequestHeaders = ["accept", "content-type", "openai-beta"];

/** OpenAI's reply headers the program reads: the body's type, the request id, and when to try again. */
function isForwardedReplyHeader(name: string): boolean {
  return (
    ["content-type", "x-request-id", "retry-after", "retry-after-ms", "x-should-retry"].includes(
      name,
    ) || name.startsWith("x-ratelimit-")
  );
}

/** OpenAI's web search tools, such as `web_search` and `web_search_preview`, and its `mcp` tool. */
function isOpenAiRemovedTool(type: string): boolean {
  return type.startsWith("web_search") || type === "mcp";
}

/**
 * A `tool_choice` once the removed tools are gone. OpenAI names a forced
 * tool by its `type`, as in `{ "type": "web_search_preview" }` or
 * `{ "type": "mcp", "server_label": "…" }`, so a choice of a removed type
 * becomes `auto`. An `allowed_tools` choice loses the removed tools from its
 * list, and becomes `auto` when none are left. A choice of `"required"`,
 * which forces some tool, becomes `auto` when no tool is left.
 */
function openAiToolChoice(choice: unknown, tools: ToolsAfterRemoval): unknown {
  if (choice === "required") return removedEveryTool(tools) ? "auto" : choice;
  if (!isPlainObject(choice)) return choice;
  if (hasRemovedType(choice, isOpenAiRemovedTool)) return "auto";
  const allowed = choice["tools"];
  if (choice["type"] !== "allowed_tools" || !Array.isArray(allowed)) return choice;
  const kept = allowed.filter(
    (tool) => !(isPlainObject(tool) && hasRemovedType(tool, isOpenAiRemovedTool)),
  );
  if (kept.length === allowed.length) return choice;
  return kept.length === 0 ? "auto" : { ...choice, tools: kept };
}

/**
 * What an OpenAI request may not ask OpenAI to reach on its own: the web
 * search tools and the `mcp` tool, which calls a remote MCP server from
 * OpenAI's side.
 */
const openAiReach: ProviderReach = {
  isRemovedTool: isOpenAiRemovedTool,
  removedFields: [],
  keptToolChoice: openAiToolChoice,
};

/** What the OpenAI route needs from outside the bridge. */
export interface OpenAiRouteDependencies {
  secrets: Secrets;
  fetch: Fetch;
  /** Reaches a compatible provider at its file's `baseUrl`; left out, such calls are refused. */
  compatibleFetch?: Fetch | undefined;
  limits: UpstreamLimits;
}

/**
 * `POST /v1/responses`, as Codex sends it, passed on to `api.openai.com`,
 * or to the one compatible provider the agent's key names (requirement
 * `harness-bridge.provider-base-url`), with the agent's key in place of the program's (requirement
 * `harness-bridge.openai`), or with the program's own sign-in for an agent
 * on a subscription (requirement `harness-bridge.sign-in`). Streaming
 * replies stream through unchanged.
 * OpenAI's web search and MCP tools are removed first, and a `tool_choice`
 * that forces one, or forces some tool when none is left, becomes `auto`.
 * An image or file that OpenAI would fetch
 * from a URL, and a stored prompt, are refused. Each call is recorded
 * with its usage and cost (requirement `harness-bridge.spend`).
 */
export function openAiRoute(dependencies: OpenAiRouteDependencies): BridgeRoute {
  return {
    method: "POST",
    path: "/v1/responses",
    handle: async (context) => {
      const access = providerAccess(context, "openai");
      const { search } = new URL(context.request.url ?? "", openAiOrigin);
      // Before the key is read, so an address the bridge refuses never reads it.
      const target = providerTarget(access, openAiApi, search, dependencies);
      const sent = await context.readBody();
      const request = parseModelRequest(sent);
      refuseStoredPrompt(request);
      refuseUrlInputs(request);
      if (target.atCompatibleProvider) {
        refuseUnknownAtCompatible(request, openAiKnown, target.models);
      }
      const call = readModelCall("openai", request, "input");
      // Also before the key is read, so a model the agent wasn't given never reads it.
      refuseModelsNotGiven(access, request);
      const authorization = await providerAuthorization(
        context,
        dependencies.secrets,
        "openai",
        (key) => ({ authorization: `Bearer ${key}` }),
      );
      const body = withoutProviderReach(request, openAiReach);
      const headers = pickHeaders(context.request.headers, forwardedRequestHeaders);
      const reply = new OpenAiReplyReader();
      await recordModelCall(context.run, call, reply, () =>
        passThrough(
          context,
          {
            provider: "OpenAI",
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
