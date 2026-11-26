import type { ToolRunContext } from "@paperclipai/plugin-sdk";
import { prWriter } from "../pr-write/write-client.ts";
import {
  markReady,
  type PrWriteDeps,
  readWritePrParams,
  writePr,
  writePrText,
} from "../pr-write/write-pr.ts";
import { ToolInputError } from "../task-tools/input.ts";
import { readPrWriteToken } from "./pr-write-settings.ts";
import { registerCounted } from "./task-tools.ts";
import { companyGitHub, type ToolsApi, toolRequestTimeoutMs } from "./tools.ts";

/**
 * The PR write tool `write_pr` and the ready step of the closing call
 * (HAL-18983). Reads go through the company's read token; writes only
 * through the PR write client, with the PR write credential the board
 * approved on 26 Nov (`pull_requests: write` on halonic-com/halonic only),
 * resolved at each write. Without that credential set, both answer with the
 * `gh` command to run instead.
 */

/** What to run instead while the board hasn't set the credential. */
const noToken =
  "the board hasn't set the PR write token yet: run gh pr create / gh pr edit / gh pr ready yourself.";

/** The reads, writes and caller for one call. */
async function depsFor(ctx: ToolsApi, runCtx: ToolRunContext): Promise<PrWriteDeps> {
  const config = await ctx.config.get(runCtx.companyId);
  const ref = readPrWriteToken(config);
  if (ref === undefined) {
    throw new ToolInputError(noToken);
  }
  const agent = await ctx.agents.get(runCtx.agentId, runCtx.companyId);
  if (agent === null) {
    throw new ToolInputError("the calling agent isn't one of the company's agents.");
  }
  const github = await companyGitHub(ctx, runCtx.companyId);
  const write = prWriter({
    fetch: (url, init) =>
      ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(toolRequestTimeoutMs) }),
    token: () => ctx.secrets.resolve(ref, { companyId: runCtx.companyId }),
  });
  return { get: github.get, write, agentKey: agent.urlKey };
}

/** The closing call's ready step, as `set_next_step` and `finish_run` take it. */
export type ReadyStep = (number: number, runCtx: ToolRunContext) => Promise<string>;

/** The ready step on this plugin context. */
export function readyStep(ctx: ToolsApi): ReadyStep {
  return async (number, runCtx) => markReady(await depsFor(ctx, runCtx), number);
}

/** Registers `write_pr` as the manifest declares it, each call counted. */
export function registerPrWriteTools(ctx: ToolsApi): void {
  registerCounted(ctx, {
    write_pr: async (api, params, runCtx) => {
      const request = readWritePrParams(params);
      const result = await writePr(await depsFor(api, runCtx), request);
      return { content: writePrText(result), data: result };
    },
  });
}
