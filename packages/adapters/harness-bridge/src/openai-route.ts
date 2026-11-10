import type { Secrets } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { OpenAiReplyReader } from "./openai-reply.ts";
import { refuseStoredPrompt, refuseUrlInputs } from "./openai-sources.ts";
import { type Fetch, passThrough, pickHeaders, type UpstreamLimits } from "./pass-through.ts";
import { providerAuthorization } from "./provider-key.ts";
import {
  hasRemovedType,
  type ProviderReach,
  parseModelRequest,
  withoutProviderReach,
} from "./provider-reach.ts";
import type { BridgeRoute } from "./route.ts";
import { readModelCall, recordModelCall } from "./spend.ts";

/** The one host the bridge sends OpenAI requests to. */
const openAiOrigin = "https://api.openai.com";

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
 * list, and becomes `auto` when none are left.
 */
function openAiToolChoice(choice: unknown): unknown {
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
  limits: UpstreamLimits;
}

/**
 * `POST /v1/responses`, as Codex sends it, passed on to `api.openai.com`
 * with the agent's key in place of the program's (requirement
 * `harness-bridge.openai`), or with the program's own sign-in for an agent
 * on a subscription (requirement `harness-bridge.sign-in`). Streaming
 * replies stream through unchanged.
 * OpenAI's web search and MCP tools are removed first, and a `tool_choice`
 * that forces one becomes `auto`. An image or file that OpenAI would fetch
 * from a URL, and a stored prompt, are refused. Each call is recorded
 * with its usage and cost (requirement `harness-bridge.spend`).
 */
export function openAiRoute(dependencies: OpenAiRouteDependencies): BridgeRoute {
  return {
    method: "POST",
    path: "/v1/responses",
    handle: async (context) => {
      const authorization = await providerAuthorization(
        context,
        dependencies.secrets,
        "openai",
        (key) => ({ authorization: `Bearer ${key}` }),
      );
      const sent = await context.readBody();
      const request = parseModelRequest(sent);
      refuseStoredPrompt(request);
      refuseUrlInputs(request);
      const call = readModelCall("openai", request, "input");
      const body = withoutProviderReach(sent, request, openAiReach);
      const { search } = new URL(context.request.url ?? "", openAiOrigin);
      const headers = pickHeaders(context.request.headers, forwardedRequestHeaders);
      const reply = new OpenAiReplyReader();
      await recordModelCall(context.run, call, reply, () =>
        passThrough(
          context,
          {
            provider: "OpenAI",
            url: new URL(`/v1/responses${search}`, openAiOrigin),
            headers: { ...headers, ...authorization },
            body,
            replyHeader: isForwardedReplyHeader,
            watch: reply,
          },
          dependencies,
        ),
      );
    },
  };
}
