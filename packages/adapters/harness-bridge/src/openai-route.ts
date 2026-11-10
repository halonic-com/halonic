import type { Secrets } from "@halonicjs/ports";
import { OpenAiReplyReader } from "./openai-reply.ts";
import { type Fetch, passThrough, pickHeaders, type UpstreamLimits } from "./pass-through.ts";
import { providerKey } from "./provider-key.ts";
import { type ProviderReach, parseModelRequest, withoutProviderReach } from "./provider-reach.ts";
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

/**
 * What an OpenAI request may not ask OpenAI to reach on its own: the web
 * search tools, such as `web_search` and `web_search_preview`, and the `mcp`
 * tool, which calls a remote MCP server from OpenAI's side.
 */
const openAiReach: ProviderReach = {
  isRemovedTool: (type) => type.startsWith("web_search") || type === "mcp",
  removedFields: [],
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
 * `harness-bridge.openai`). Streaming replies stream through unchanged.
 * OpenAI's web search and MCP tools are removed first. Each call is
 * recorded with its usage and cost (requirement `harness-bridge.spend`).
 */
export function openAiRoute(dependencies: OpenAiRouteDependencies): BridgeRoute {
  return {
    method: "POST",
    path: "/v1/responses",
    handle: async (context) => {
      const key = await providerKey(context.run, dependencies.secrets, "openai");
      const sent = await context.readBody();
      const request = parseModelRequest(sent);
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
            headers: { ...headers, authorization: `Bearer ${key}` },
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
