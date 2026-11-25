import type { Tool, WorkspaceSnapshot } from "@halonicjs/format";
import { deepEqual } from "@halonicjs/std";
import { activeSnapshot } from "./active-snapshot.ts";
import { type GitHubGet, type GitHubQuery, gitHubQueryReader, gitHubReader } from "./github.ts";
import type { ActionHandlers } from "./handlers.ts";
import type { RuntimeHost, ToolDeclaration, ToolResult, ToolRunContext } from "./host.ts";
import { paperclipAccess } from "./paperclip-access.ts";
import { writeMode } from "./paperclip-writes.ts";
import { type PrecheckDeps, precheckAccess } from "./precheck/precheck-access.ts";
import { keepFailedRun } from "./runs/failed-runs-record.ts";

/**
 * Registers a plugin's tools under their short names (`pr_status`), each
 * served by its action's handler with the settings of the snapshot the
 * runtime picks. Paperclip takes tool names and parameters only from the
 * manifest, which the builder writes from the built-in snapshot. So a newer
 * snapshot can change a tool's settings, callers and wording, or leave the
 * tool out, but never add a tool, change its parameters or point it at
 * another action: such a tool is off. Nor can it switch a tool from dry run
 * to write: going live is a reviewed plugin build. Going back to dry run
 * is allowed, so a misbehaving writing tool can be stopped without one.
 */

/** The part of the plugin context the runtime uses, so tests can fake it. */
export type WorkspaceRuntimeApi = RuntimeHost;

/** What the plugin worker registers its tools from. */
export interface RuntimeSetup {
  /** The manifest's tool declarations. */
  readonly declarations: readonly ToolDeclaration[];
  /** The snapshot built into the plugin. */
  readonly builtIn: WorkspaceSnapshot;
  readonly handlers: ActionHandlers;
  readonly now?: () => Date;
  /** The precheck client's `fetch`, pause and clock; tests pass fakes. */
  readonly precheck?: PrecheckDeps;
}

/** A whole call gives up after this long, before Paperclip's tool bridge stops it at about 15 s. */
export const callTimeoutMs = 10_000;

/** One GitHub request in a call; shorter than the call, so a hung request fails as itself. */
export const requestTimeoutMs = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000} s.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The GitHub readers for one call, made only when the call needs GitHub,
 * with the read token the installer set as `githubToken`, resolved once.
 * The runtime never mints a token and never reads a key from the workspace.
 */
function callReaders(
  ctx: WorkspaceRuntimeApi,
  config: Readonly<Record<string, unknown>>,
  companyId: string,
) {
  let token: Promise<string> | undefined;
  const readToken = (): Promise<string> => {
    token ??= (async () => {
      const binding = config["githubToken"] as { type?: unknown; secretId?: unknown } | undefined;
      if (binding?.type !== "secret_ref" || typeof binding.secretId !== "string") {
        throw new Error("no GitHub read token is set in the plugin's settings.");
      }
      return ctx.secrets.resolve({ type: "secret_ref", secretId: binding.secretId }, { companyId });
    })();
    return token;
  };
  const fetch = <T extends object>(url: string, init: T) =>
    ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
  let reader: GitHubGet | undefined;
  let queryReader: GitHubQuery | undefined;
  return {
    github: async (): Promise<GitHubGet> => {
      reader ??= gitHubReader({ fetch, token: await readToken() });
      return reader;
    },
    githubQuery: async (): Promise<GitHubQuery> => {
      queryReader ??= gitHubQueryReader({ fetch, token: await readToken() });
      return queryReader;
    },
  };
}

/** Why a served tool can't run as the plugin was built, or undefined when it can. */
function offReason(served: Tool | undefined, built: Tool | undefined, commit: string) {
  if (served === undefined || built === undefined) {
    return `the workspace snapshot ${commit} doesn't define it.`;
  }
  if (served.action.run !== built.action.run || !deepEqual(served.parameters, built.parameters)) {
    return `the workspace snapshot ${commit} changes its action or parameters; that needs a new plugin build.`;
  }
  if (writeMode(served) === "write" && writeMode(built) !== "write") {
    return `the workspace snapshot ${commit} sets mode: write, which the plugin wasn't built with; that needs a new plugin build.`;
  }
  return undefined;
}

/**
 * May this agent call the tool? Only the agent's `urlKey` counts, ignoring
 * case: it is unique in a company, while a display name isn't, so another
 * agent with the same display name must not get through.
 */
function mayCall(tool: Tool, agent: { readonly urlKey: string }) {
  if (tool.callers === "everyone") {
    return true;
  }
  const urlKey = agent.urlKey.toLowerCase();
  return tool.callers.agents.some((caller) => caller.toLowerCase() === urlKey);
}

/** One call: picks the snapshot, checks the tool and the caller, then runs the action. */
async function serve(
  ctx: WorkspaceRuntimeApi,
  setup: RuntimeSetup,
  call: { readonly name: string; readonly params: unknown; readonly runCtx: ToolRunContext },
): Promise<ToolResult> {
  const { name, runCtx } = call;
  const config = await ctx.config.get(runCtx.companyId);
  const { github, githubQuery } = callReaders(ctx, config, runCtx.companyId);
  const now = (setup.now ?? (() => new Date()))();
  const { builtIn } = setup;
  const active = await activeSnapshot(ctx, {
    companyId: runCtx.companyId,
    config,
    builtIn,
    github,
    now,
  });
  const served = active.snapshot.tools.find((tool) => tool.name === name);
  const built = builtIn.tools.find((tool) => tool.name === name);
  const off = offReason(served, built, active.snapshot.workspace.commit);
  if (off !== undefined || served === undefined) {
    return { error: `${name} is off: ${off}` };
  }
  const handler = setup.handlers[served.action.run];
  if (handler === undefined) {
    return { error: `${name} is off: this plugin runtime can't run ${served.action.run} yet.` };
  }
  const agent = await ctx.agents.get(runCtx.agentId, runCtx.companyId);
  if (agent === null || !mayCall(served, agent)) {
    return { error: `${name}: this tool isn't offered to the calling agent.` };
  }
  return handler.run({
    tool: served,
    params: call.params,
    templates: active.snapshot.templates ?? [],
    ...(active.snapshot.routing === undefined ? {} : { routing: active.snapshot.routing }),
    caller: { agentId: runCtx.agentId, urlKey: agent.urlKey, name: agent.name },
    companyId: runCtx.companyId,
    github,
    githubQuery,
    paperclip: paperclipAccess(ctx, handler.capabilities, {
      companyId: runCtx.companyId,
      runId: runCtx.runId,
    }),
    now,
    // Only this one action gets the precheck client, built from the settings read above.
    ...(served.action.run === "halonic.precheck"
      ? {
          precheck: precheckAccess(
            ctx,
            config,
            { companyId: runCtx.companyId, tool: name },
            setup.precheck,
          ),
        }
      : {}),
  });
}

/** Counts one call; the agent gets its answer even when the metric doesn't save. */
async function counted(
  ctx: WorkspaceRuntimeApi,
  name: string,
  runCtx: ToolRunContext,
  result: ToolResult,
): Promise<ToolResult> {
  const outcome = result.error === undefined ? "ok" : "error";
  try {
    await ctx.metrics.write("tools.calls", 1, { companyId: runCtx.companyId, tool: name, outcome });
  } catch {
    // Counting is best effort by design: a metrics outage must not fail an agent's tool call.
  }
  return result;
}

/**
 * Keeps a record of failed runs when a built-in tool lists them, the only
 * case the builder asks for `events.subscribe`. Events are kept one at a
 * time, so two runs failing together don't overwrite each other's entry.
 */
function keepFailedRuns(ctx: WorkspaceRuntimeApi, setup: RuntimeSetup): void {
  const listed = setup.builtIn.tools.some((tool) => tool.action.run === "paperclip.failed-runs");
  if (!listed || setup.handlers["paperclip.failed-runs"] === undefined) {
    return;
  }
  let queue: Promise<void> = Promise.resolve();
  ctx.events.on("agent.run.failed", (event) => {
    const now = (setup.now ?? (() => new Date()))();
    queue = queue.catch(() => undefined).then(() => keepFailedRun(ctx.state, event, now));
    return queue;
  });
}

/** Registers each declared tool. A tool the built-in snapshot doesn't define is off, never open. */
export function registerWorkspaceTools(ctx: WorkspaceRuntimeApi, setup: RuntimeSetup): void {
  keepFailedRuns(ctx, setup);
  for (const declaration of setup.declarations) {
    const name = declaration.name;
    ctx.tools.register(name, declaration, async (params, runCtx, host = ctx) => {
      let result: ToolResult;
      try {
        result = await withTimeout(
          serve(host, setup, { name, params, runCtx }),
          callTimeoutMs,
          name,
        );
      } catch (error) {
        result = { error: `${name}: ${(error as Error).message}` };
      }
      return counted(host, name, runCtx, result);
    });
  }
}
