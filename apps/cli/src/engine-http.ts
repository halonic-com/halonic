import { connectorHostClass } from "@halonicjs/adapter-http-kit";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { proxySetting } from "./proxy-setting.ts";

/**
 * The `fetch` a workflow step reaches the network with: model providers, MCP
 * servers over HTTP and integrations. It goes through the app's proxy setting
 * and the address checks of `http-node`, and keeps a model server on this
 * computer working, as the connector's host classes allow. The global `fetch`
 * does neither and is never used for a step.
 */
export function engineHttp(): { fetch: (url: string, init?: RequestInit) => Promise<Response> } {
  const client = createNodeHttpClient({ hostClass: connectorHostClass, proxy: proxySetting });
  return { fetch: (url, init) => client.fetch(url, init) };
}
