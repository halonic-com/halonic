import { branchOwner, type Memory, type PullFacts, type WatchedTask } from "./decide.ts";
import {
  handoffMessage,
  julianOnlyOnHead,
  julianRefused,
  outsideKey,
  pullId,
  pushedAfterApproval,
  pushedMessage,
  type Refused,
  type Reviewer,
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
  heldAt: undefined,
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

/** Each pull request's reviewer by its paths, read once per pass and task. */
function routes(route: ReviewerRoute): (pull: PullFacts) => Promise<Reviewer> {
  const read = new Map<string, Promise<Reviewer>>();
  return (pull) => {
    const known = read.get(pullId(pull));
    if (known !== undefined) {
      return known;
    }
    const reviewer = route(pull);
    read.set(pullId(pull), reviewer);
    return reviewer;
  };
}

/** The pull requests whose only approvals on the head are Julian's outside his limits. */
async function refusedOf(
  pulls: readonly PullFacts[],
  memory: Memory,
  routeOf: (pull: PullFacts) => Promise<Reviewer>,
): Promise<Refused> {
  const suspects = pulls.filter((pull) => julianOnlyOnHead(pull, memory));
  const refused = await Promise.all(
    suspects.map(async (pull) => (julianRefused(pull, await routeOf(pull)) ? [pullId(pull)] : [])),
  );
  return new Set(refused.flat());
}

async function handOff(
  options: ReviewStepOptions,
  task: WatchedTask,
  pulls: readonly PullFacts[],
  memory: Memory,
): Promise<boolean> {
  if (options.route === undefined) {
    options.log(`${task.identifier}: ready for review, but no reviewer route is set`);
    return false;
  }
  const routeOf = routes(options.route);
  const refused = await refusedOf(pulls, memory, routeOf);
  const waiting = waitingForReview(task, pulls, memory, refused);
  const [first] = waiting;
  if (first === undefined || task.assigneeAgentId === null) {
    return false;
  }
  const reviewer = reviewerOf(branchOwner(first.branch), await Promise.all(waiting.map(routeOf)));
  const to = options.owners.get(reviewer);
  if (to === undefined) {
    options.log(`${task.identifier}: ready for review, but Paperclip has no agent ${reviewer}`);
    return false;
  }
  const body = handoffMessage(waiting, reviewer, refused);
  options.log(`${task.identifier}: to ${reviewer}${options.dryRun ? " (dry run)" : ""}\n${body}`);
  if (options.dryRun) {
    return true;
  }
  const key = waiting
    .map((pull) => (refused.has(pullId(pull)) ? outsideKey(pull) : readyKey(pull)))
    .join(" | ");
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
  // Before the comments are read: every Julian-only approval counts as refused, the widest case.
  const suspects: Refused = new Set(
    pulls.filter((pull) => julianOnlyOnHead(pull, noMemory)).map(pullId),
  );
  const mayWarn = pushedAfterApproval(pulls, noMemory).length > 0;
  const mayHandOff = waitingForReview(task, pulls, noMemory, suspects).length > 0;
  if (!(mayWarn || mayHandOff)) {
    return nothing;
  }
  const memory = await readMemory();
  const warned = mayWarn && (await warn(options, task, pulls, memory));
  const handedOff = mayHandOff && (await handOff(options, task, pulls, memory));
  return { handedOff, warned };
}
