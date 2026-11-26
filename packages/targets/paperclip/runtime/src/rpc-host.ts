import type { IssueRecord, RuntimeHost, ToolResult, ToolRunContext } from "./host.ts";
import type { HostLink } from "./host-link.ts";
import type { WorkerEvents } from "./worker-events.ts";

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

/** Paperclip's answer that should be a list; anything else is an error, not an empty list. */
function asList<T>(method: string, result: unknown): readonly T[] {
  if (!Array.isArray(result)) throw new Error(`Paperclip's ${method} answer isn't a list.`);
  return result as T[];
}

/** Paperclip's answer that should be one record or nothing. */
function asRecordOrNull<T>(method: string, result: unknown): T | null {
  if (result === null || result === undefined) return null;
  if (!isRecord(result)) throw new Error(`Paperclip's ${method} answer isn't a record.`);
  return result as T;
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

/** Where the plugin's tools and event listeners go, for the worker to find. */
export interface WorkerRegistry {
  readonly tools: Map<string, ToolRun>;
  readonly events: WorkerEvents;
}

/**
 * The host for one invocation: its calls echo the invocation id Paperclip
 * scopes them by. Tools and event listeners go into the worker's registry.
 */
export function rpcHost(
  link: HostLink,
  registry: WorkerRegistry,
  invocationId?: string,
): RuntimeHost {
  const to = (method: string, params: unknown) => link.call({ method, params, invocationId });
  return {
    tools: { register: (name, _declaration, run) => void registry.tools.set(name, run) },
    events: { on: (name, listener) => registry.events.on(name, listener) },
    agents: {
      get: async (agentId, companyId) => {
        const agent = await to("agents.get", { agentId, companyId });
        const known =
          isRecord(agent) &&
          typeof agent["urlKey"] === "string" &&
          typeof agent["name"] === "string";
        return known ? { urlKey: String(agent["urlKey"]), name: String(agent["name"]) } : null;
      },
      list: async (input) => asList("agents.list", await to("agents.list", { ...input })),
    },
    projects: {
      list: async (input) => asList("projects.list", await to("projects.list", { ...input })),
    },
    issues: {
      get: async (issueId, companyId) =>
        asRecordOrNull("issues.get", await to("issues.get", { issueId, companyId })),
      createComment: async (issueId, body, companyId, options) => {
        const params = { issueId, body, companyId, authorAgentId: options?.authorAgentId };
        const comment = await to("issues.createComment", params);
        if (!isRecord(comment) || typeof comment["id"] !== "string")
          throw new Error("Paperclip's issues.createComment answer has no id.");
        return { id: comment["id"] };
      },
      // As the SDK sends it: the acting agent and run travel inside the patch.
      update: async (issueId, patch, companyId, actor) => {
        const sent = { ...patch, actorAgentId: actor?.actorAgentId, actorRunId: actor?.actorRunId };
        const issue = await to("issues.update", { issueId, patch: sent, companyId });
        if (
          !isRecord(issue) ||
          typeof issue["id"] !== "string" ||
          typeof issue["status"] !== "string"
        )
          throw new Error("Paperclip's issues.update answer isn't a task.");
        return issue as unknown as IssueRecord;
      },
      listComments: async (issueId, companyId) =>
        asList("issues.listComments", await to("issues.listComments", { issueId, companyId })),
      relations: {
        get: async (issueId, companyId) => {
          const relations = await to("issues.relations.get", { issueId, companyId });
          const blockedBy = isRecord(relations) ? relations["blockedBy"] : undefined;
          return { blockedBy: asList("issues.relations.get", blockedBy) };
        },
      },
      documents: {
        list: async (issueId, companyId) =>
          asList(
            "issues.documents.list",
            await to("issues.documents.list", { issueId, companyId }),
          ),
        get: async (issueId, key, companyId) => {
          const document = await to("issues.documents.get", { issueId, key, companyId });
          return asRecordOrNull("issues.documents.get", document);
        },
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
