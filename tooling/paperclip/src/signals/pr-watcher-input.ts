import type {
  Decision,
  Memory,
  PullFacts,
  WatchedTask as WatcherTask,
} from "../pr-watcher/decide.ts";
import type {
  PrWatcherAction,
  PrWatcherInput,
  PrWatcherSettings,
  WatchedPull,
  WatchedTask,
} from "./rules/pr-watcher.ts";

/**
 * The PR watcher rule's compact input from what the watcher reads today
 * (HAL-17980): only the fields the rule uses, so a busy company's tasks stay
 * under the 16 KB ToolScript `inputBytes` default (HAL-17772).
 */

function pullOf(pull: PullFacts): WatchedPull {
  return {
    pr: `${pull.repo}#${pull.number}`,
    state: pull.state,
    head: pull.head,
    ciOkOnHead: pull.ciOkOnHead,
    draft: pull.draft,
    conflicting: pull.conflicting,
    inQueue: pull.inQueue,
    retargeted: pull.retargeted,
    latestReview: pull.latestReview ?? null,
    githubApproved: pull.githubApproval !== undefined,
    held: pull.held !== undefined,
    requiredFailed: (pull.failedRequired ?? []).map((failed) => failed.workflow),
    landed: pull.landed,
    mergedAt: pull.mergedAt ?? null,
  };
}

/**
 * One task as the rule reads it.
 *
 * @param task - the task as the watcher lists it
 * @param ownerId - the agent every one of its branches names, if one
 * @param pulls - its pull requests' facts
 * @param memory - what the watcher told it before
 */
export function watchedTask(
  task: WatcherTask,
  ownerId: string | undefined,
  pulls: readonly PullFacts[],
  memory: Memory,
): WatchedTask {
  return {
    task: task.identifier,
    holder: task.assigneeAgentId,
    owner: ownerId ?? null,
    running: task.running,
    openChildren: task.openChildren,
    parked: task.parked === true,
    memory: {
      reported: [...memory.reported].sort(),
      seenUntil: memory.seenUntil ?? null,
      heldAt: memory.heldAt ?? null,
      lastCommentAt: memory.lastCommentAt ?? null,
    },
    pulls: pulls.map(pullOf),
  };
}

/**
 * Today's watcher's decision on a task as the rule's actions: done is a task
 * update, each wake reason a wake.
 */
export function decisionActions(task: string, decision: Decision): PrWatcherAction[] {
  if (decision.kind === "skip") {
    return [];
  }
  if (decision.kind === "done") {
    const pulls = decision.pulls.map((pull) => `${pull.repo}#${pull.number}`);
    return [
      { kind: "task-update", key: `${task}|${pulls.join(",")}|done`, task, status: "done", pulls },
    ];
  }
  return decision.reasons.map(({ pull, kind, key }) => ({
    kind: "wake",
    key,
    task,
    pr: `${pull.repo}#${pull.number}`,
    head: pull.head,
    reason: kind === "stack-conflict" ? "conflict" : kind,
  }));
}

/** The ToolScript `inputBytes` default (HAL-17772): the most bytes one rule input may have. */
export const maxInputBytes = 16 * 1024;

function bytesOf(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/**
 * The rule's inputs for one pass, each under {@link maxInputBytes}: the rule
 * decides each task on its own, so the tasks are cut into batches in order.
 * A task too large for an input of its own is left out and named, never cut.
 */
export function ruleInputs(
  now: string,
  settings: PrWatcherSettings,
  tasks: readonly WatchedTask[],
): { readonly inputs: PrWatcherInput[]; readonly tooLarge: string[] } {
  const inputs: PrWatcherInput[] = [];
  const tooLarge: string[] = [];
  let batch: WatchedTask[] = [];
  for (const task of tasks) {
    if (bytesOf({ now, settings, tasks: [task] }) > maxInputBytes) {
      tooLarge.push(task.task);
    } else if (bytesOf({ now, settings, tasks: [...batch, task] }) > maxInputBytes) {
      inputs.push({ now, settings, tasks: batch });
      batch = [task];
    } else {
      batch.push(task);
    }
  }
  if (batch.length > 0) {
    inputs.push({ now, settings, tasks: batch });
  }
  return { inputs, tooLarge };
}
