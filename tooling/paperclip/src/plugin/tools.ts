import type {
  PluginAgentsClient,
  PluginConfigClient,
  PluginHttpClient,
  PluginSecretsClient,
  PluginToolsClient,
  ToolResult,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { myPrs, myPrsText } from "../pr-tools/my-prs.ts";
import { prStatus, statusText } from "../pr-tools/pr-status.ts";
import { type GitHubGet, gitHubReader } from "../pr-watcher/github.ts";
import { readSettings, requestTimeoutMs } from "./job.ts";
import { manifest } from "./manifest.ts";
import { countingGet, type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The agent tools `pr_status` and `my_prs`. Like the watcher, they read
 * GitHub with GET requests only, through `ctx.http`, with the company's
 * read-only token.
 */

/** The part of the plugin context the tools use, so tests can fake it. */
export interface ToolsApi extends MetricsApi {
  readonly tools: Pick<PluginToolsClient, "register">;
  readonly agents: Pick<PluginAgentsClient, "get">;
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly http: PluginHttpClient;
}

/** A whole tool call gives up after this long, below the host's 30 s limit. */
export const toolTimeoutMs = 25_000;

/** Rejects once `ms` have passed, so a slow GitHub can't hold the agent's run. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000} s.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** `pr` as a number or a pull request URL on one of the watched repositories. */
export function readPrParams(
  params: unknown,
  repos: readonly string[],
): { repo: string; number: number } | string {
  const { pr, repo } = (params ?? {}) as { pr?: unknown; repo?: unknown };
  const url =
    typeof pr === "string"
      ? /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)\/?$/.exec(pr)
      : null;
  const number = Number(url?.[2] ?? pr);
  const chosen = url?.[1] ?? (typeof repo === "string" && repo !== "" ? repo : repos[0]);
  if (!Number.isInteger(number) || number <= 0) {
    return "pr must be a pull request number or its GitHub URL.";
  }
  if (chosen === undefined || !repos.includes(chosen)) {
    return `repo must be one of: ${repos.join(", ")}.`;
  }
  return { repo: chosen, number };
}

/** Runs one tool call with the company's settings and GitHub reader. Errors go back to the agent. */
async function run(
  ctx: ToolsApi,
  name: string,
  runCtx: ToolRunContext,
  body: (get: GitHubGet, repos: readonly string[]) => Promise<ToolResult>,
): Promise<ToolResult> {
  let requests = () => 0;
  let result: ToolResult;
  try {
    const settings = readSettings(await ctx.config.get(runCtx.companyId));
    if (settings.token === undefined) {
      return { error: `${name}: no GitHub token is set in the plugin's settings.` };
    }
    const token = await ctx.secrets.resolve(settings.token, { companyId: runCtx.companyId });
    const counted = countingGet(
      gitHubReader({
        fetch: (url, init) =>
          ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
        token,
      }),
    );
    requests = counted.requests;
    result = await withTimeout(body(counted.get, settings.repos), toolTimeoutMs, name);
  } catch (error) {
    result = { error: `${name}: ${(error as Error).message}` };
  }
  // The agent gets its answer even when the metrics don't save.
  await writeMetrics(
    ctx,
    { "tools.calls": 1, "tools.github_requests": requests() },
    {
      companyId: runCtx.companyId,
      tool: name,
      outcome: result.error === undefined ? "ok" : "error",
    },
  );
  return result;
}

/** Registers `pr_status` and `my_prs` as the manifest declares them. */
export function registerTools(ctx: ToolsApi): void {
  const declared = new Map((manifest.tools ?? []).map((tool) => [tool.name, tool]));
  const declaration = (name: string) => {
    const tool = declared.get(name);
    if (tool === undefined) {
      throw new Error(`Agent tools: the manifest doesn't declare ${name}.`);
    }
    return tool;
  };

  ctx.tools.register("pr_status", declaration("pr_status"), (params, runCtx) =>
    run(ctx, "pr_status", runCtx, async (get, repos) => {
      const target = readPrParams(params, repos);
      if (typeof target === "string") {
        return { error: `pr_status: ${target}` };
      }
      const status = await prStatus(get, target.repo, target.number);
      return { content: statusText(status), data: status };
    }),
  );

  ctx.tools.register("my_prs", declaration("my_prs"), (_params, runCtx) =>
    run(ctx, "my_prs", runCtx, async (get, repos) => {
      const agent = await ctx.agents.get(runCtx.agentId, runCtx.companyId);
      if (agent === null) {
        return { error: "my_prs: the calling agent wasn't found." };
      }
      const prs = await myPrs(get, repos, agent.urlKey);
      return { content: myPrsText(agent.urlKey, prs), data: prs };
    }),
  );
}
