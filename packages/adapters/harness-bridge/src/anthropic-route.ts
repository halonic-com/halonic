import type { HarnessBridgeOptions, Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { type Fetch, passThrough, pickHeaders, type UpstreamLimits } from "./pass-through.ts";
import type { BridgeRoute } from "./route.ts";
import { withoutTools } from "./web-tools.ts";

/** The one host the bridge sends Anthropic requests to. */
const anthropicOrigin = "https://api.anthropic.com";

/** The request headers that go on to Anthropic. The program's key and the run token stay behind. */
const forwardedRequestHeaders = ["accept", "anthropic-beta", "anthropic-version", "content-type"];

/** Anthropic's reply headers the program reads: the body's type, the request id, and when to try again. */
function isForwardedReplyHeader(name: string): boolean {
  return (
    ["content-type", "request-id", "retry-after", "x-should-retry"].includes(name) ||
    name.startsWith("anthropic-ratelimit-")
  );
}

/** Anthropic's server tools that reach the web, such as `web_search_20250305` and `web_fetch_20250910`. */
function isWebTool(type: string): boolean {
  return type.startsWith("web_search_") || type.startsWith("web_fetch_");
}

/** What the Anthropic route needs from outside the bridge. */
export interface AnthropicRouteDependencies {
  secrets: Secrets;
  fetch: Fetch;
  limits: UpstreamLimits;
}

/**
 * `POST /v1/messages`, as Claude Code sends it, passed on to
 * `api.anthropic.com` with the agent's key in place of the program's
 * (requirement `harness-bridge.anthropic`). Streaming replies stream through
 * unchanged. Anthropic's web tools are removed first; image and PDF blocks
 * go on as they are.
 */
export function anthropicRoute(dependencies: AnthropicRouteDependencies): BridgeRoute {
  return {
    method: "POST",
    path: "/v1/messages",
    handle: async (context) => {
      const key = await anthropicKey(context.run, dependencies.secrets);
      const body = withoutTools(await context.readBody(), isWebTool);
      // Keep the program's query, such as Claude Code's `?beta=true`.
      const { search } = new URL(context.request.url ?? "", anthropicOrigin);
      const headers = pickHeaders(context.request.headers, forwardedRequestHeaders);
      await passThrough(
        context,
        {
          provider: "Anthropic",
          url: new URL(`/v1/messages${search}`, anthropicOrigin),
          headers: { ...headers, "x-api-key": key },
          body,
          replyHeader: isForwardedReplyHeader,
        },
        dependencies,
      );
    },
  };
}

/**
 * The value of the Anthropic key this agent uses.
 *
 * @throws KindedError `denied` when the agent doesn't use Anthropic with a key
 * @throws KindedError `unauthenticated` when the key isn't set in Halonic's secrets
 */
async function anthropicKey(run: HarnessBridgeOptions, secrets: Secrets): Promise<string> {
  const access = run.providers.anthropic;
  if (access === undefined) {
    throw new KindedError("denied", "This agent isn't set up to use Anthropic models.");
  }
  if (access.kind === "sign-in") {
    // Passing a person's own sign-in on comes with build plan step B5.
    throw new KindedError(
      "denied",
      "This agent signs in with a subscription, which the Halonic bridge doesn't pass on yet.",
    );
  }
  const key = await secrets.get(access.secret);
  if (key === null) {
    throw new KindedError(
      "unauthenticated",
      `The secret "${access.secret}" that holds this agent's Anthropic key isn't set.`,
    );
  }
  return key;
}
