import {
  type ActionHandlers,
  checkedSnapshot,
  type RuntimeHost,
  registerWorkspaceTools,
  type ToolDeclaration,
} from "@halonicjs/target-paperclip-runtime";
import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { describe, expect, test } from "vitest";
import { fakeMetrics } from "../plugin/fake-host.test-helper.ts";
import { readSettings } from "../plugin/job.ts";
import { manifest } from "../plugin/manifest.ts";
import { readPrParams, registerTools, type ToolsApi } from "../plugin/tools.ts";
import { prStatus, statusText } from "../pr-tools/pr-status.ts";
import { recording } from "../pr-watcher/fakes.test-helper.ts";

/**
 * Today's `pr_status` from Agent tools, as a handler and a snapshot for the
 * generic Paperclip plugin runtime. It holds our review rules (HAL-14809), so
 * it stays here until those are generic (plan HAL-17450, step 1b). Its test
 * shows the runtime answers as Agent tools does. `my_prs` moved to the
 * workspace plugin (HAL-17968).
 */

/** The repositories the tools read when a snapshot names none: Agent tools' own default. */
const todaysRepos = readSettings({}).repos;

/** The repositories a tool's settings name. */
function repositoriesOf(settings: unknown): readonly string[] {
  const { repositories } = (settings ?? {}) as { repositories?: readonly string[] };
  return repositories ?? [];
}

/** Today's tool as an action handler, with its answers unchanged. */
const todaysHandlers: ActionHandlers = {
  "github.pull-request": {
    capabilities: [],
    run: async ({ tool, params, github }) => {
      const get = await github();
      const target = readPrParams(params, repositoriesOf(tool.action.with));
      if (typeof target === "string") {
        return { error: `${tool.name}: ${target}` };
      }
      const status = await prStatus(get, target.repo, target.number);
      return { content: statusText(status), data: status };
    },
  },
};

/** Which action runs each of today's tools. */
const todaysActions: Readonly<Record<string, string>> = {
  pr_status: "github.pull-request",
};

/** One property of a declaration's parameters schema, as Agent tools writes it. */
interface SchemaProperty {
  readonly type: string | readonly string[];
  readonly description: string;
}

/**
 * A declaration's parameters as a tool file declares them, so the snapshot
 * check holds today's names to what each action reads. A number-or-URL
 * parameter such as `pr` is text in a tool file.
 */
function parametersOf(declaration: ToolDeclaration) {
  const schema = declaration.parametersSchema as {
    readonly properties?: Readonly<Record<string, SchemaProperty>>;
    readonly required?: readonly string[];
  };
  return Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([name, property]) => [
      name,
      {
        type: Array.isArray(property.type) ? "string" : property.type,
        description: property.description,
        required: schema.required?.includes(name) ?? false,
      },
    ]),
  );
}

/**
 * The snapshot of today's tools that the declarations name, on Agent tools'
 * repositories, checked as the runtime checks any snapshot.
 */
function todaysSnapshot(declarations: readonly ToolDeclaration[]) {
  const tools = declarations
    .filter((declaration) => todaysActions[declaration.name] !== undefined)
    .map((declaration) => ({
      version: 1,
      id: declaration.name.replaceAll("_", "-"),
      name: declaration.name,
      description: declaration.description,
      parameters: parametersOf(declaration),
      callers: "everyone",
      action: { run: todaysActions[declaration.name], with: { repositories: todaysRepos } },
    }))
    .sort((first, second) => first.name.localeCompare(second.name));
  return checkedSnapshot({
    format: 1,
    workspace: { name: "agent-tools", commit: "0".repeat(40) },
    tools,
  });
}

const runCtx: ToolRunContext = {
  agentId: "agent-mateo",
  runId: "run-1",
  companyId: "acme",
  projectId: "",
};
const githubToken = { type: "secret_ref", secretId: "secret-read-token" };

/** Agent tools' own declaration of the tool, as the builder will copy it. */
const declarations = (manifest.tools ?? []).filter((tool) => tool.name === "pr_status");

const answers = recording("green");

/** The calls compared: an answer and refusals before any request. */
const calls: [string, unknown][] = [
  ["pr_status", { pr: 4605 }],
  ["pr_status", { pr: "https://github.com/someone/else/pull/7" }],
  ["pr_status", { pr: "not a number" }],
];

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;

/** A plugin context with the tool settings and GitHub answers above, state in memory. */
function host(config: Record<string, unknown>) {
  const handlers = new Map<string, Handler>();
  const sent: string[] = [];
  const saved = new Map<string, unknown>();
  const ctx = {
    metrics: fakeMetrics().metrics,
    state: {
      get: async (key: unknown) => saved.get(JSON.stringify(key)) ?? null,
      set: async (key: unknown, value: unknown) => {
        saved.set(JSON.stringify(key), value);
      },
      delete: async (key: unknown) => {
        saved.delete(JSON.stringify(key));
      },
    },
    tools: { register: (name: string, _: unknown, fn: Handler) => handlers.set(name, fn) },
    agents: {
      get: async (id: string) =>
        id === "agent-mateo" ? { id, urlKey: "mateo", name: "Mateo" } : null,
    },
    config: { get: async () => config },
    secrets: { resolve: async () => "test-token" },
    http: {
      fetch: async (url: string) => {
        sent.push(url);
        const { pathname, search } = new URL(url);
        const body = (answers as Record<string, unknown>)[pathname + search];
        return body === undefined
          ? new Response(null, { status: 404 })
          : new Response(JSON.stringify(body), { status: 200 });
      },
    },
  };
  const call = (name: string, params: unknown) => {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} isn't registered`);
    return handler(params, runCtx);
  };
  return { ctx, call, sent };
}

verifies("paperclip.workspace-runtime-today", () => {
  describe("today's tools on the Paperclip plugin runtime", () => {
    test("answer and read GitHub as Agent tools does", async () => {
      const today = host({ githubToken });
      registerTools(today.ctx as unknown as ToolsApi);
      const runtime = host({ githubToken });
      registerWorkspaceTools(runtime.ctx as unknown as RuntimeHost, {
        declarations,
        builtIn: todaysSnapshot(declarations),
        handlers: todaysHandlers,
      });
      for (const [name, params] of calls) {
        expect(await runtime.call(name, params)).toEqual(await today.call(name, params));
      }
      expect(runtime.sent).toEqual(today.sent);
      expect(runtime.sent.length).toBeGreaterThan(0);
    });

    test("the snapshot holds the tool on Agent tools' repositories, with its parameters", () => {
      const snapshot = todaysSnapshot(declarations);
      expect(snapshot.tools.map((tool) => [tool.name, Object.keys(tool.parameters)])).toEqual([
        ["pr_status", ["pr", "repo"]],
      ]);
      expect(snapshot.tools.map((tool) => [tool.name, tool.action])).toEqual([
        [
          "pr_status",
          {
            run: "github.pull-request",
            with: { repositories: ["halonic-com/halonic", "halonic-com/cloud"] },
          },
        ],
      ]);
    });
  });
});
