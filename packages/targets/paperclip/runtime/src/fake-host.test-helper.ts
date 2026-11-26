import {
  type ActionParameter,
  type Tool,
  type ToolParameter,
  toolActionInfo,
  type WorkspaceSnapshot,
} from "@halonicjs/format";
import type { PaperclipEvent, ToolResult, ToolRunContext } from "./host.ts";
import { snapshotPath } from "./pinned-snapshot.ts";
import type { WorkspaceRuntimeApi } from "./register.ts";

/** The invented `acme` workspace the tests pin. */
export const workspaceRepo = "acme/workspace-acme";
export const pinnedCommit = "1".repeat(40);
export const githubToken = { type: "secret_ref", secretId: "secret-read-token" };

export const runCtx: ToolRunContext = {
  agentId: "agent-mateo",
  runId: "run-1",
  companyId: "acme",
  projectId: "",
};

type ObjectParameter = Extract<ToolParameter, { type: "object" }>;

/** How a tool file declares a parameter its action reads: as the object or list it reads, else as text. */
function declarationOf({ name, required, shape }: ActionParameter): ToolParameter {
  const description = `The ${name}.`;
  if (shape?.type === "object") {
    return {
      type: "object",
      description,
      required,
      // An object's fields are flat in the actions, so each comes out as text.
      fields: declarationsOf(shape.fields) as ObjectParameter["fields"],
    };
  }
  if (shape?.type === "list") {
    const items =
      shape.items === "string" ? { type: "string", maxLength: 1000 } : { type: shape.items };
    return { type: "list", description, required, items, maxItems: 20 } as ToolParameter;
  }
  return { type: "string", description, required, maxLength: 1000 };
}

function declarationsOf(parameters: readonly ActionParameter[]): Record<string, ToolParameter> {
  return Object.fromEntries(
    parameters.map((parameter) => [parameter.name, declarationOf(parameter)]),
  );
}

/** The parameters a tool file declares for an action: the ones it reads, flat ones as text. */
export function parametersFor(action: Tool["action"]["run"]): Tool["parameters"] {
  return declarationsOf(toolActionInfo(action).parameters);
}

/**
 * One acme tool on `acme/website`, as a tool file would define it, with the
 * parameters its action reads unless the overrides give others.
 */
export function acmeTool(name: string, overrides: Partial<Tool> = {}): Tool {
  const action = overrides.action ?? {
    run: "github.pull-request",
    with: { repositories: ["acme/website"] },
  };
  return {
    version: 1,
    id: name.replaceAll("_", "-"),
    name,
    description: `Acme's ${name}.`,
    parameters: parametersFor(action.run),
    callers: "everyone",
    action,
    ...overrides,
  } as Tool;
}

/** The acme workspace's snapshot: `my_prs` and `pr_status`, sorted by name. */
export function acmeSnapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    format: 1,
    workspace: { name: "acme", commit: pinnedCommit },
    tools: [
      acmeTool("my_prs", {
        action: { run: "github.open-pull-requests", with: { repositories: ["acme/website"] } },
      }),
      acmeTool("pr_status"),
    ],
    ...overrides,
  };
}

/** The snapshot built into a test plugin: the acme tools at another commit. */
export const builtIn = acmeSnapshot({ workspace: { name: "acme", commit: "0".repeat(40) } });

/** GitHub's answers for a snapshot file at the pinned commit, with the pin that matches it. */
export async function publishedSnapshot(
  snapshot: unknown,
  check: "success" | "failure" = "success",
) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const answers = {
    [`/repos/${workspaceRepo}/commits/${pinnedCommit}/check-runs?check_name=ci-ok&per_page=100`]: {
      check_runs: [{ status: "completed", conclusion: check, started_at: "2026-11-24T10:00:00Z" }],
    },
    [`/repos/${workspaceRepo}/contents/${snapshotPath(pinnedCommit)}?ref=halonic-snapshots`]: {
      encoding: "base64",
      content: Buffer.from(bytes).toString("base64"),
    },
  };
  const pin = { workspaceRepo, snapshotCommit: pinnedCommit, snapshotSha256: sha256 };
  return { answers, pin, sha256 };
}

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;

/**
 * A plugin context whose GitHub answers from `answers` (a request with no
 * answer gets 404; with `github.down`, every request fails), with plugin
 * state in memory, the metrics written, the tool handlers registered and
 * `deliver` handing an event to the worker's subscriptions. The caller is
 * always `agent-mateo`, as `agent` describes it; the one task is `ACME-7`.
 * Its issue client records each write in `writes`.
 */
export function fakeHost(config: Record<string, unknown>, answers: Record<string, unknown>) {
  const handlers = new Map<string, Handler>();
  const sent: string[] = [];
  const saved = new Map<string, unknown>();
  const metrics: { name: string; value: number; tags: unknown }[] = [];
  const github = { down: false };
  const agent = { urlKey: "mateo", name: "Mateo" };
  const subscribed = new Map<string, ((event: PaperclipEvent) => Promise<void>)[]>();
  const writes: string[] = [];
  const ctx = {
    events: {
      on: (name: string, fn: (event: PaperclipEvent) => Promise<void>) => {
        subscribed.set(name, [...(subscribed.get(name) ?? []), fn]);
        return () => undefined;
      },
    },
    issues: {
      get: async (id: string) => (id === "task-7" ? { id, identifier: "ACME-7" } : null),
      createComment: async (issueId: string) => {
        writes.push(`createComment ${issueId}`);
        return { id: "comment-new" };
      },
      update: async (issueId: string) => {
        writes.push(`update ${issueId}`);
        return { id: issueId, status: "todo" };
      },
    },
    metrics: {
      write: async (name: string, value: number, tags?: unknown) => {
        metrics.push({ name, value, tags });
      },
    },
    state: {
      get: async (key: unknown) => saved.get(JSON.stringify(key)) ?? null,
      set: async (key: unknown, value: unknown) => {
        saved.set(JSON.stringify(key), value);
      },
      delete: async (key: unknown) => {
        saved.delete(JSON.stringify(key));
      },
    },
    tools: {
      register: (name: string, _declaration: unknown, fn: Handler) => handlers.set(name, fn),
    },
    agents: {
      get: async (id: string) => (id === "agent-mateo" ? { id, ...agent } : null),
      list: async () => [{ id: "agent-mateo", ...agent }],
    },
    projects: { list: async () => [] },
    config: { get: async () => config },
    secrets: { resolve: async () => "test-token" },
    http: {
      fetch: async (url: string) => {
        sent.push(url);
        if (github.down) {
          throw new Error("connect ECONNREFUSED");
        }
        const { pathname, search } = new URL(url);
        const body = answers[pathname + search];
        return body === undefined
          ? new Response(null, { status: 404 })
          : new Response(JSON.stringify(body), { status: 200 });
      },
    },
  } as unknown as WorkspaceRuntimeApi;
  const call = (name: string, params: unknown) => {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} isn't registered`);
    return handler(params, runCtx);
  };
  const deliver = async (event: PaperclipEvent) => {
    await Promise.all((subscribed.get(event.eventType) ?? []).map((fn) => fn(event)));
  };
  return { ctx, call, deliver, subscribed, sent, saved, metrics, github, agent, writes };
}
