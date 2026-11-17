import { anthropicOrigin } from "./anthropic-route.ts";
import { openAiOrigin } from "./openai-route.ts";

const providerOrigins: ReadonlySet<string> = new Set([anthropicOrigin, openAiOrigin]);

/**
 * The host class for the client the bridge calls providers with: `public`
 * for Anthropic's and OpenAI's own origins, which the routes fix, and
 * undefined for every other host, so that client reaches nothing else. It
 * fits the `hostClass` option of `createNodeHttpClient`.
 *
 * @example
 * const http = createNodeHttpClient({ hostClass: providerHostClass });
 * new NodeHarnessBridgeServer({ secrets, fetch: (url, init) => http.fetch(url, init) });
 */
export function providerHostClass(url: URL): "public" | undefined {
  return providerOrigins.has(url.origin) ? "public" : undefined;
}
