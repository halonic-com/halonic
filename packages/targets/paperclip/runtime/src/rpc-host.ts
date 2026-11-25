import type { RuntimeHost, ToolResult, ToolRunContext } from "./host.ts";
import type { HostLink } from "./host-link.ts";

/**
 * The runtime's `RuntimeHost` over the worker protocol: each client call
 * becomes one call back to Paperclip, with the method names and params the
 * plugin SDK uses, and each answer is checked before the runtime sees it.
 */

/** A registered tool's code, which may get the host of the call it runs in. */
export type ToolRun = (
  params: unknown,
  runCtx: ToolRunContext,
  host?: RuntimeHost,
) => Promise<ToolResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Paperclip's answer to an `http.fetch`, as a `Response`. */
function toResponse(result: unknown): Response {
  if (!isRecord(result) || typeof result["status"] !== "number") {
    throw new Error("Paperclip's http.fetch answer has no status.");
  }
  const status = result["status"];
  const noBody = status === 204 || status === 205 || status === 304;
  const body = typeof result["body"] === "string" && !noBody ? result["body"] : null;
  const headers = isRecord(result["headers"]) ? (result["headers"] as Record<string, string>) : {};
  return new Response(body, { status, headers });
}

/** The request `init` as Paperclip's `http.fetch` takes it: a method, plain headers and a text body. */
function sentInit(init: RequestInit) {
  if (init.body != null && typeof init.body !== "string") {
    throw new Error("http.fetch takes a text body only.");
  }
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  return {
    method: init.method ?? "GET",
    headers,
    ...(init.body == null ? {} : { body: init.body }),
  };
}

/**
 * The host for one invocation: its calls echo the invocation id Paperclip
 * scopes them by. Tools register into `tools`, where the worker finds them.
 */
export function rpcHost(
  link: HostLink,
  tools: Map<string, ToolRun>,
  invocationId?: string,
): RuntimeHost {
  const to = (method: string, params: unknown) => link.call({ method, params, invocationId });
  return {
    tools: { register: (name, _declaration, run) => void tools.set(name, run) },
    agents: {
      get: async (agentId, companyId) => {
        const agent = await to("agents.get", { agentId, companyId });
        const known =
          isRecord(agent) &&
          typeof agent["urlKey"] === "string" &&
          typeof agent["name"] === "string";
        return known ? { urlKey: String(agent["urlKey"]), name: String(agent["name"]) } : null;
      },
    },
    config: {
      get: async (companyId) => {
        const config = await to("config.get", { companyId });
        return isRecord(config) ? config : {};
      },
    },
    secrets: {
      resolve: async (secretRef, { companyId }) => {
        const value = await to("secrets.resolve", { secretRef, companyId });
        if (typeof value !== "string")
          throw new Error("Paperclip's secrets.resolve answer isn't text.");
        return value;
      },
    },
    http: {
      fetch: async (url, init = {}) => {
        const params = { url, init: sentInit(init) };
        const signal = init.signal ?? undefined;
        return toResponse(await link.call({ method: "http.fetch", params, invocationId, signal }));
      },
    },
    metrics: {
      write: async (name, value, tags) => void (await to("metrics.write", { name, value, tags })),
    },
    state: {
      get: (key) => to("state.get", { ...key }),
      set: async (key, value) => void (await to("state.set", { ...key, value })),
      delete: async (key) => void (await to("state.delete", { ...key })),
    },
  };
}
