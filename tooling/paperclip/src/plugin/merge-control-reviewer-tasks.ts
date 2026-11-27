import type { PluginIssuesClient, PluginLogger } from "@paperclipai/plugin-sdk";
import {
  type ReviewerAsk,
  type ReviewerTaskStep,
  type ReviewerTasks,
  reviewerAsksOf,
  reviewerTaskSteps,
} from "../merge-control/reviewer-asks.ts";
import type { MergeSnapshot } from "../merge-control/snapshot.ts";
import type { MergeSettings } from "../merge-control/state.ts";
import { taskOfBranch } from "../pr-watcher/discover.ts";
import { createReviewTask, type HostApi, paperclipHost } from "./host.ts";

/**
 * The review tasks of each merge-control pass (HAL-20636): one task per pull
 * request and reviewer for the asks `reviewerAsksOf` finds, a child of the
 * task the branch names (so it has that task's project), assigned `todo`
 * and `high`, and woken. A new head on the same ask moves the task back to
 * `todo` with a note, or makes a new task when the reviewer closed it; the
 * task is closed when its ask is gone. Status changes go through the host
 * adapter (`host.ts`). Like the reviewer wake, it only logs while
 * `mergeWatchersDryRun` is on.
 */

/** The part of the plugin context the review tasks use. */
export interface ReviewerTasksApi extends HostApi {
  readonly issues: HostApi["issues"] & Pick<PluginIssuesClient, "create">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** The board's switches for the review tasks. */
export interface ReviewerTaskSettings {
  /** Only log; `mergeWatchersDryRun`, on unless the board turns it off. */
  readonly dryRun: boolean;
  /** Nora's approval alone still needs Liam's: `mergeControl.noraShadow`, on unless the board turns it off. */
  readonly noraShadow: boolean;
}

export function readReviewerTaskSettings(
  config: Readonly<Record<string, unknown>>,
): ReviewerTaskSettings {
  const section = (config["mergeControl"] ?? {}) as Readonly<Record<string, unknown>>;
  return {
    dryRun: config["mergeWatchersDryRun"] !== false,
    noraShadow: section["noraShadow"] !== false,
  };
}

/** The pass's input. */
export interface ReviewerTasksInput {
  readonly companyId: string;
  readonly repo: string;
  readonly snapshot: MergeSnapshot;
  readonly rules: MergeSettings;
  readonly settings: ReviewerTaskSettings;
  readonly before: ReviewerTasks;
}

const askTitles: Readonly<Record<ReviewerAsk["kind"], string>> = {
  "security-signoff": "Julian's security sign-off",
  "liam-after-nora": "Liam's review after Nora's approval",
};

export function reviewerTaskTitle(ask: ReviewerAsk): string {
  return `Review #${ask.pull.number}: ${askTitles[ask.kind]}`;
}

function nextStep(ask: ReviewerAsk): string {
  const h9 = ask.pull.head.slice(0, 9);
  return ask.kind === "security-signoff"
    ? `Review it for security and post the plain line \`Julian: security sign-off on head ${h9}\` on the PR, or your findings.`
    : `Review it and post "Liam: approved on head \`${h9}\`" on the PR, or your findings.`;
}

export function reviewerTaskText(ask: ReviewerAsk, repo: string): string {
  const number = ask.pull.number;
  return [
    `[#${number}](https://github.com/${repo}/pull/${number}) (head \`${ask.pull.head.slice(0, 9)}\`) is approved and green and waits only for you.`,
    `The Merger's gate: ${ask.reason}.`,
    nextStep(ask),
    "The Merger closes this task once that lands or the PR merges.",
  ].join("\n\n");
}

function wakeKey(ask: ReviewerAsk): string {
  return `merge-control reviewer ${ask.pull.number}:${ask.reviewer}@${ask.pull.head}`;
}

/** Creates and wakes the task; "" when the branch names no task Paperclip has, or no such agent. */
async function create(
  ctx: ReviewerTasksApi,
  input: ReviewerTasksInput,
  ask: ReviewerAsk,
  agents: ReadonlyMap<string, string>,
): Promise<string> {
  const { companyId } = input;
  const identifier = taskOfBranch(ask.pull.branch);
  const parent = identifier === undefined ? null : await ctx.issues.get(identifier, companyId);
  const agentId = agents.get(ask.reviewer);
  if (parent === null || agentId === undefined) {
    const why = parent === null ? `branch ${ask.pull.branch} names no task` : "no such agent";
    ctx.logger.info(
      `Merge control: no review task for #${ask.pull.number} (${ask.reviewer}): ${why}`,
      { companyId },
    );
    return "";
  }
  const task = await createReviewTask(
    ctx.issues,
    {
      parent,
      title: reviewerTaskTitle(ask),
      description: reviewerTaskText(ask, input.repo),
      agentId,
    },
    companyId,
  );
  // Like a plugin's comment, a plugin's new task wakes nobody by itself.
  await ctx.issues.requestWakeup(task, companyId, {
    reason: "merge_control_reviewer_task",
    idempotencyKey: wakeKey(ask),
  });
  return task;
}

async function apply(
  ctx: ReviewerTasksApi,
  input: ReviewerTasksInput,
  step: ReviewerTaskStep,
  agents: () => Promise<ReadonlyMap<string, string>>,
): Promise<string | undefined> {
  const host = paperclipHost(ctx, input.companyId);
  switch (step.kind) {
    case "create":
      return await create(ctx, input, step.ask, await agents());
    case "new-head": {
      const h9 = step.ask.pull.head.slice(0, 9);
      const body = `New head \`${h9}\`, still waiting for you. ${nextStep(step.ask)}`;
      const woken = await host.wake(step.task, body, wakeKey(step.ask), { todo: true });
      // The reviewer closed it on an older head: a new task for this one.
      return woken === "closed" ? await create(ctx, input, step.ask, await agents()) : step.task;
    }
    case "close":
      if (step.task !== "") {
        await host.markDone(step.task, `Closed by the Merger: ${step.why}.`);
      }
      return undefined;
  }
}

function stepLine(step: ReviewerTaskStep): string {
  return step.kind === "close"
    ? `close ${step.key}: ${step.why}`
    : `${step.kind} ${step.key} on head ${step.ask.pull.head.slice(0, 9)}: ${step.ask.reason}`;
}

/**
 * Runs the steps and answers the tasks to keep. A failed step is logged and
 * leaves its entry as it was, so the next pass tries again; a dry run keeps
 * nothing, so turning it off acts on the next pass.
 */
export async function reviewerTasksPass(
  ctx: ReviewerTasksApi,
  input: ReviewerTasksInput,
): Promise<ReviewerTasks> {
  const { companyId, snapshot, settings } = input;
  const asks = reviewerAsksOf(snapshot, input.rules, settings.noraShadow);
  const steps = reviewerTaskSteps(asks, input.before, snapshot);
  const tasks: Record<string, ReviewerTasks[string]> = { ...input.before };
  let agentIds: Map<string, string> | undefined;
  const agents = async () => {
    agentIds ??= new Map(
      (await ctx.agents.list({ companyId, limit: 500 })).map((agent) => [
        agent.urlKey.toLowerCase(),
        agent.id,
      ]),
    );
    return agentIds;
  };
  for (const step of steps) {
    if (settings.dryRun) {
      ctx.logger.info(`Merge control: review task (dry run): ${stepLine(step)}`, { companyId });
      continue;
    }
    try {
      const task = await apply(ctx, input, step, agents);
      if (task === undefined) {
        delete tasks[step.key];
      } else if (step.kind !== "close") {
        tasks[step.key] = { task, kind: step.ask.kind, head: step.ask.pull.head };
      }
      ctx.logger.info(`Merge control: review task: ${stepLine(step)}`, { companyId });
    } catch (error) {
      ctx.logger.error(
        `Merge control: review task ${stepLine(step)} failed: ${(error as Error).message}`,
        { companyId },
      );
    }
  }
  return tasks;
}
