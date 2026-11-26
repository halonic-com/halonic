import type {
  PluginAgentsClient,
  PluginConfigClient,
  PluginHttpClient,
  PluginSecretsClient,
  PluginToolsClient,
  ToolResult,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { defaultSettings } from "../merge-control/state.ts";
import { type CiTarget, ciFailures, ciFailuresText } from "../pr-tools/ci-failures.ts";
import { prStatus, statusText } from "../pr-tools/pr-status.ts";
import { withVerdictGate } from "../pr-tools/pr-status-verdicts.ts";
import { queueState, queueStateText } from "../pr-tools/queue-state.ts";
import { rebaseCheck, rebaseCheckText } from "../pr-tools/rebase-pr.ts";
import { type GitHubGet, gitHubReader } from "../pr-watcher/github.ts";
import type { Snapshot } from "../snapshot/shape.ts";
import { loadSnapshot, type StateApi } from "../snapshot/store.ts";
import { type CopiesApi, paperclipCopies } from "./approval-copies.ts";
import { readSettings } from "./job.ts";
import { manifest } from "./manifest.ts";
import { countingGet, type MetricsApi, writeMetrics } from "./metrics.ts";
import { verdictGateOn } from "./review-verdict-declaration.ts";
import { recordedSourceOf, type VerdictGateApi } from "./verdict-gate.ts";

/**
 * The agent tools `pr_status`, `ci_failures`, `rebase_pr` and `queue_state`. Like the watcher,
 * `pr_status`, `ci_failures` and `rebase_pr` read GitHub with GET requests only, through `ctx.http`, with
 * the company's read-only token. `queue_state` reads the watcher's last
 * snapshot from plugin state and sends no request at all. `my_prs` moved to
 * the workspace plugin (HAL-17968).
 */

/** The part of the plugin context the tools use, so tests can fake it. */
export interface ToolsApi extends MetricsApi, StateApi, CopiesApi, VerdictGateApi {
  readonly tools: Pick<PluginToolsClient, "register">;
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly http: PluginHttpClient;
  /**
   * `rebase_pr` reads the calling agent's url key, which its own branches start with;
   * `pr_status` lists the agents to find each approval's Paperclip copy (HAL-19324).
   */
  readonly agents: Pick<PluginAgentsClient, "get" | "list">;
}

/**
 * A whole tool call gives up after this long. Paperclip's tool bridge stops a
 * call after about 15 s with a bare "Tool execution timed out", so the tool
 * answers first with its own error (HAL-17111).
 */
export const toolTimeoutMs = 10_000;

/**
 * One GitHub request in a tool call. Shorter than the call, so a request that
 * hangs fails as itself instead of the watcher's 15 s outliving the call.
 */
export const toolRequestTimeoutMs = 8_000;

/** Rejects once `ms` have passed, so a slow GitHub can't hold the agent's run. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
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

/**
 * `ci_failures`' commit: a full 40-character `sha` on one of the watched
 * repositories, or else `pr` as `pr_status` reads it.
 */
export function readCiParams(params: unknown, repos: readonly string[]): CiTarget | string {
  const { sha, repo } = (params ?? {}) as { sha?: unknown; repo?: unknown };
  if (sha === undefined || sha === "") {
    return readPrParams(params, repos);
  }
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha)) {
    return "sha must be a full 40-character commit.";
  }
  const chosen = typeof repo === "string" && repo !== "" ? repo : repos[0];
  if (chosen === undefined || !repos.includes(chosen)) {
    return `repo must be one of: ${repos.join(", ")}.`;
  }
  return { repo: chosen, sha: sha.toLowerCase() };
}

/** A company's GitHub reader for one call, counting its requests, and its watched repositories. */
export interface CompanyGitHub {
  readonly get: GitHubGet;
  readonly requests: () => number;
  readonly repos: readonly string[];
}

/**
 * The company's read-only GitHub reader, as the tools and the state packet
 * use it: each request gives up after `toolRequestTimeoutMs`.
 */
export async function companyGitHub(
  ctx: Pick<ToolsApi, "config" | "secrets" | "http">,
  companyId: string,
): Promise<CompanyGitHub> {
  const settings = readSettings(await ctx.config.get(companyId));
  if (settings.token === undefined) {
    throw new Error("no GitHub token is set in the plugin's settings.");
  }
  const token = await ctx.secrets.resolve(settings.token, { companyId });
  const counted = countingGet(
    gitHubReader({
      fetch: (url, init) =>
        ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(toolRequestTimeoutMs) }),
      token,
    }),
  );
  return { ...counted, repos: settings.repos };
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
    const github = await companyGitHub(ctx, runCtx.companyId);
    requests = github.requests;
    result = await withTimeout(body(github.get, github.repos), toolTimeoutMs, name);
  } catch (error) {
    result = { error: `${name}: ${(error as Error).message}` };
  }
  return recordCall(ctx, name, runCtx, result, requests());
}

/** Counts one tool call. The agent gets its answer even when the metrics don't save. */
async function recordCall(
  ctx: ToolsApi,
  name: string,
  runCtx: ToolRunContext,
  result: ToolResult,
  requests: number,
): Promise<ToolResult> {
  await writeMetrics(
    ctx,
    { "tools.calls": 1, "tools.github_requests": requests },
    {
      companyId: runCtx.companyId,
      tool: name,
      outcome: result.error === undefined ? "ok" : "error",
    },
  );
  return result;
}

/** Runs one tool call on the company's last snapshot, without GitHub. */
async function fromSnapshot(
  ctx: ToolsApi,
  name: string,
  runCtx: ToolRunContext,
  body: (snapshot: Snapshot) => ToolResult,
): Promise<ToolResult> {
  let result: ToolResult;
  try {
    const snapshot = await loadSnapshot(ctx, runCtx.companyId);
    result =
      snapshot === undefined
        ? { error: `${name}: no GitHub snapshot yet; the PR watcher hasn't finished a pass.` }
        : body(snapshot);
  } catch (error) {
    result = { error: `${name}: ${(error as Error).message}` };
  }
  return recordCall(ctx, name, runCtx, result, 0);
}

/** Registers `pr_status`, `ci_failures`, `rebase_pr` and `queue_state` as the manifest declares them. */
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
      const copies = paperclipCopies(ctx, runCtx.companyId);
      const read = await prStatus(get, target.repo, target.number, undefined, copies);
      // The board's flag: approvals from the recorded verdicts only (HAL-19969).
      const gateOn = verdictGateOn(await ctx.config.get(runCtx.companyId));
      const source = gateOn
        ? recordedSourceOf(ctx, runCtx.companyId, defaultSettings.teamLogin)
        : undefined;
      const status = await withVerdictGate(get, read, source);
      return { content: statusText(status), data: status };
    }),
  );

  ctx.tools.register("ci_failures", declaration("ci_failures"), (params, runCtx) =>
    run(ctx, "ci_failures", runCtx, async (get, repos) => {
      const target = readCiParams(params, repos);
      if (typeof target === "string") {
        return { error: `ci_failures: ${target}` };
      }
      const failures = await ciFailures(get, target);
      return { content: ciFailuresText(failures), data: failures };
    }),
  );

  ctx.tools.register("rebase_pr", declaration("rebase_pr"), (params, runCtx) =>
    run(ctx, "rebase_pr", runCtx, async (get, repos) => {
      const target = readPrParams(params, repos);
      if (typeof target === "string") {
        return { error: `rebase_pr: ${target}` };
      }
      const agent = await ctx.agents.get(runCtx.agentId, runCtx.companyId);
      if (agent === null) {
        return { error: "rebase_pr: the calling agent isn't one of the company's agents." };
      }
      const check = rebaseCheck(await prStatus(get, target.repo, target.number), agent.urlKey);
      return { content: rebaseCheckText(check), data: check };
    }),
  );

  ctx.tools.register("queue_state", declaration("queue_state"), (_params, runCtx) =>
    fromSnapshot(ctx, "queue_state", runCtx, (snapshot) => {
      const state = queueState(snapshot, new Date());
      return { content: queueStateText(state), data: state };
    }),
  );
}
