import type {
  PluginEntitiesClient,
  PluginIssuesClient,
  ToolResult,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { defaultSettings } from "../merge-control/state.ts";
import { ToolInputError } from "../task-tools/input.ts";
import { readVerdictPull } from "../verdicts/pull-facts.ts";
import {
  readVerdictParams,
  reviewVerdict,
  type VerdictCaller,
  type VerdictDeps,
  type VerdictTask,
} from "../verdicts/review-verdict.ts";
import { entityVerdicts } from "../verdicts/store.ts";
import { paperclipCopies } from "./approval-copies.ts";
import { verdictReviewerOf } from "./review-verdict-declaration.ts";
import { findTask, registerCounted } from "./task-tools.ts";
import { companyGitHub, type ToolsApi, toolTimeoutMs, withTimeout } from "./tools.ts";

/**
 * Registers `review_verdict` (HAL-19481) on the plugin context. Paperclip
 * names the calling agent and run (`runCtx`); the tool checks that run with
 * Paperclip twice: it holds the task (`assertCheckoutOwner`, which refuses a
 * finished run: halonic-com/server's checkout-owner test), and it is among
 * the task's running runs, which also covers a finished run whose checkout
 * Paperclip keeps for a retry. GitHub is read with the read-only token; the
 * only writes are the record and the task comment.
 */

/** The part of the plugin context the tool uses, so tests can fake it. */
export interface VerdictToolApi extends ToolsApi {
  readonly issues: Pick<
    PluginIssuesClient,
    "get" | "listComments" | "createComment" | "assertCheckoutOwner" | "getSubtree"
  >;
  readonly entities: Pick<PluginEntitiesClient, "upsert" | "list">;
}

/** Why the run doesn't hold the task or isn't running, or undefined when it does and is. */
export async function runHolds(
  ctx: Pick<VerdictToolApi, "issues">,
  companyId: string,
  task: VerdictTask,
  caller: VerdictCaller,
): Promise<string | undefined> {
  const notYours = `your run doesn't hold ${task.identifier}: it must be in progress with you, checked out by this run`;
  try {
    const owner = await ctx.issues.assertCheckoutOwner({
      issueId: task.id,
      companyId,
      actorAgentId: caller.agentId,
      actorRunId: caller.runId,
    });
    if (owner.checkoutRunId !== caller.runId) {
      return `${notYours}.`;
    }
  } catch (error) {
    return `${notYours} (${(error as Error).message}).`;
  }
  const subtree = await ctx.issues.getSubtree(task.id, companyId, {
    includeRoot: true,
    includeActiveRuns: true,
  });
  const running = (subtree.activeRuns?.[task.id] ?? []).some(
    (run) => run.id === caller.runId && run.status === "running",
  );
  return running ? undefined : `your run isn't one of ${task.identifier}'s running runs.`;
}

/** The tool's reads and writes for one call, and the repositories it may name. */
async function depsFor(
  ctx: VerdictToolApi,
  runCtx: ToolRunContext,
): Promise<{ deps: VerdictDeps; repos: readonly string[] }> {
  const { companyId } = runCtx;
  const reviewer = verdictReviewerOf(await ctx.config.get(companyId), runCtx.agentId);
  const caller =
    reviewer === undefined ? undefined : { reviewer, agentId: runCtx.agentId, runId: runCtx.runId };
  const github = await companyGitHub(ctx, companyId);
  const copies = paperclipCopies(ctx, companyId);
  const deps: VerdictDeps = {
    caller,
    teamLogin: defaultSettings.teamLogin,
    task: async (identifier) => {
      const issue = await findTask(ctx, identifier, companyId);
      return {
        id: issue.id,
        identifier: issue.identifier ?? identifier,
        title: issue.title,
        description: issue.description ?? null,
      };
    },
    runHolds: (task, held) => runHolds(ctx, companyId, task, held),
    pull: (repo, pr) => readVerdictPull(github.get, repo, pr),
    taskComments: async (identifier) => {
      const issue = await ctx.issues.get(identifier, companyId);
      if (issue === null) {
        return [];
      }
      const comments = await ctx.issues.listComments(issue.id, companyId);
      return comments.map(({ authorAgentId, origin, body }) => ({ authorAgentId, origin, body }));
    },
    agents: () => copies.agents(),
    store: entityVerdicts(ctx.entities, companyId),
    postAsCaller: async (taskId, body) => {
      await ctx.issues.createComment(taskId, body, companyId, { authorAgentId: runCtx.agentId });
    },
  };
  return { deps, repos: github.repos };
}

async function recordVerdict(
  ctx: VerdictToolApi,
  params: unknown,
  runCtx: ToolRunContext,
): Promise<ToolResult> {
  const work = async (): Promise<ToolResult> => {
    const { deps, repos } = await depsFor(ctx, runCtx);
    const call = readVerdictParams(params, repos);
    const { record, line, task } = await reviewVerdict(deps, call);
    return {
      content: `Recorded: ${line} (record ${record.id}), and posted it on ${task} as you. Post the same line on the pull request.`,
      data: { record },
    };
  };
  try {
    return await withTimeout(work(), toolTimeoutMs, "review_verdict");
  } catch (error) {
    if (error instanceof ToolInputError) {
      throw error;
    }
    // A timeout can come after the record was stored, so this can't say nothing was recorded.
    // Calling again is safe: a second record of the same verdict judges the same.
    throw new ToolInputError(
      `${(error as Error).message} If the verdict line isn't on the task, call review_verdict again: recording the same verdict twice changes nothing.`,
    );
  }
}

/** Registers `review_verdict` as the manifest declares it, each call counted. */
export function registerReviewVerdictTool(ctx: VerdictToolApi): void {
  registerCounted(ctx, { review_verdict: recordVerdict });
}
