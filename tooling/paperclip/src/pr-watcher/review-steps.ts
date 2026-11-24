import { branchOwner, type Memory, type PullFacts, type WatchedTask } from "./decide.ts";
import {
  handoffMessage,
  pushedAfterApproval,
  pushedMessage,
  type ReviewerRoute,
  readyKey,
  reviewerOf,
  waitingForReview,
} from "./handoff.ts";
import type { Paperclip } from "./paperclip.ts";

/** What the review steps need from the pass. */
export interface ReviewStepOptions {
  readonly paperclip: Paperclip;
  /** The reviewer by the path rules; without one, no task goes to review. */
  readonly route: ReviewerRoute | undefined;
  /** Agents by the short name their branches start with. */
  readonly owners: ReadonlyMap<string, string>;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
}

/** What the review steps did on one task. */
export interface ReviewStepOutcome {
  readonly handedOff: boolean;
  readonly warned: boolean;
}

const nothing: ReviewStepOutcome = { handedOff: false, warned: false };

const noMemory: Memory = {
  reported: new Set<string>(),
  seenUntil: undefined,
  held: false,
  lastCommentAt: undefined,
};

async function warn(
  options: ReviewStepOptions,
  task: WatchedTask,
  pulls: readonly PullFacts[],
  memory: Memory,
): Promise<boolean> {
  const pushes = pushedAfterApproval(pulls, memory);
  if (pushes.length === 0) {
    return false;
  }
  const body = pushedMessage(pushes);
  options.log(
    `${task.identifier}: pushed after approval${options.dryRun ? " (dry run)" : ""}\n${body}`,
  );
  return options.dryRun || (await options.paperclip.note(task.id, body)) === "written";
}

async function handOff(
  options: ReviewStepOptions,
  task: WatchedTask,
  waiting: readonly PullFacts[],
): Promise<boolean> {
  const [first] = waiting;
  if (first === undefined || task.assigneeAgentId === null) {
    return false;
  }
  if (options.route === undefined) {
    options.log(`${task.identifier}: ready for review, but no reviewer route is set`);
    return false;
  }
  const reviewer = reviewerOf(
    branchOwner(first.branch),
    await Promise.all(waiting.map(options.route)),
  );
  const to = options.owners.get(reviewer);
  if (to === undefined) {
    options.log(`${task.identifier}: ready for review, but Paperclip has no agent ${reviewer}`);
    return false;
  }
  const body = handoffMessage(waiting, reviewer);
  options.log(`${task.identifier}: to ${reviewer}${options.dryRun ? " (dry run)" : ""}\n${body}`);
  if (options.dryRun) {
    return true;
  }
  const key = waiting.map(readyKey).join(" | ");
  const outcome = await options.paperclip.handOff(
    task.id,
    { from: task.assigneeAgentId, to },
    body,
    key,
  );
  if (outcome === "closed") {
    options.log(`${task.identifier}: its author moved it during this pass, so left alone`);
  }
  return outcome === "written";
}

/**
 * For a task its author holds with no run going, and nothing else to tell
 * them: warns once about a push after an approval, then hands the task to
 * its reviewer when every open pull request is ready. The task's comments
 * are read only when the pull requests alone say one of them may apply.
 */
export async function reviewSteps(
  options: ReviewStepOptions,
  task: WatchedTask,
  pulls: readonly PullFacts[],
  readMemory: () => Promise<Memory>,
): Promise<ReviewStepOutcome> {
  const mayWarn = pushedAfterApproval(pulls, noMemory).length > 0;
  const mayHandOff = waitingForReview(task, pulls, noMemory).length > 0;
  if (!(mayWarn || mayHandOff)) {
    return nothing;
  }
  const memory = await readMemory();
  const warned = mayWarn && (await warn(options, task, pulls, memory));
  const handedOff =
    mayHandOff && (await handOff(options, task, waitingForReview(task, pulls, memory)));
  return { handedOff, warned };
}
