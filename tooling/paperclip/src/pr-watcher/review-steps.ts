import {
  type Answer,
  type Answers,
  answerOf,
  blockingReviewer,
  reviewerAfterAnswer,
} from "./answered.ts";
import { type Carried, carriedMessage, carries, carryKey } from "./carry-over.ts";
import { branchOwner, type Memory, type PullFacts, type WatchedTask } from "./decide.ts";
import {
  approvedBefore,
  handoffKey,
  handoffMessage,
  julianOnlyOnHead,
  julianRefused,
  type PathReview,
  pullId,
  pushedAfterApproval,
  pushedKey,
  pushedMessage,
  type Refused,
  type Reviewer,
  type ReviewerRoute,
  reviewerOf,
  type SinceApproval,
  type SinceApprovals,
  waitingForReview,
} from "./handoff.ts";
import type { Paperclip } from "./paperclip.ts";
import type { RebaseOnly } from "./rebase-only.ts";
import type { StackRebase } from "./stack-rebase.ts";
import { type Unneeded, unneeded, unneededKey, unneededMessage } from "./unneeded-rebase.ts";

/** What the review steps need from the pass. */
export interface ReviewStepOptions {
  readonly paperclip: Paperclip;
  /** The reviewer by the path rules; without one, no task goes to review. */
  readonly route: ReviewerRoute | undefined;
  /** Whether only a rebase changed a pull request since its approval; without it, never. */
  readonly rebaseOnly?: RebaseOnly | undefined;
  /** Agents by the short name their branches start with. */
  readonly owners: ReadonlyMap<string, string>;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
  /** When the pass started: a monitor due within the hour is the author's own short check. */
  readonly now: Date;
  /** The stack step, whose tried heads say which pull requests it rebased off a merged base. */
  readonly stackRebase?: StackRebase | undefined;
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

/** What one task's review steps read once and share: path reviews and comparisons. */
interface Reads {
  readonly routeOf: (pull: PullFacts) => Promise<PathReview>;
  readonly sinceOf: (pull: PullFacts) => Promise<SinceApproval | undefined>;
}

/** Each pull request's read, done once per pass and task. */
function once<T>(read: (pull: PullFacts) => Promise<T>): (pull: PullFacts) => Promise<T> {
  const done = new Map<string, Promise<T>>();
  return (pull) => {
    const known = done.get(pullId(pull));
    if (known !== undefined) {
      return known;
    }
    const result = read(pull);
    done.set(pullId(pull), result);
    return result;
  };
}

/**
 * What changed since a pull request's older approval, or undefined when it
 * has none. A failed comparison counts as a real change, so the reviewer of
 * the paths gets it, and a security pull request by its paths isn't
 * compared (HAL-17901).
 */
function sinceReader(
  options: ReviewStepOptions,
  task: WatchedTask,
  routeOf: (pull: PullFacts) => Promise<PathReview>,
): (pull: PullFacts) => Promise<SinceApproval | undefined> {
  return async (pull) => {
    const before = approvedBefore(pull);
    if (before === undefined) {
      return undefined;
    }
    if ((await routeOf(pull)).security) {
      return { by: before.by, approvedHead: before.head, rebaseOnly: false, security: true };
    }
    const check = options.rebaseOnly ?? (async () => false);
    const rebaseOnly = await check(pull, before.head).catch((error: unknown) => {
      options.log(
        `${task.identifier}: couldn't compare #${pull.number}: ${(error as Error).message}`,
      );
      return false;
    });
    const stacked = options.stackRebase?.tried.baseOf(pullId(pull), before.head) !== undefined;
    return {
      by: before.by,
      approvedHead: before.head,
      rebaseOnly,
      ...(stacked ? { stacked } : {}),
    };
  };
}

function readsOf(options: ReviewStepOptions, task: WatchedTask, route: ReviewerRoute): Reads {
  const routeOf = once(route);
  return { routeOf, sinceOf: once(sinceReader(options, task, routeOf)) };
}

/** The pull requests whose only approvals on the head are Julian's outside his limits. */
async function refusedOf(
  pulls: readonly PullFacts[],
  memory: Memory,
  reads: Reads,
): Promise<Refused> {
  const suspects = pulls.filter((pull) => julianOnlyOnHead(pull, memory));
  const refused = await Promise.all(
    suspects.map(async (pull) =>
      julianRefused(pull, await reads.routeOf(pull)) ? [pullId(pull)] : [],
    ),
  );
  return new Set(refused.flat());
}

/** The open findings the author answered, by pull request (HAL-18460). */
function answersOf(
  options: ReviewStepOptions,
  task: WatchedTask,
  pulls: readonly PullFacts[],
  memory: Memory,
): Answers {
  return new Map(
    pulls.flatMap((pull): [string, Answer][] => {
      const answer = answerOf(pull, task, memory, options.now);
      return answer === undefined ? [] : [[pullId(pull), answer]];
    }),
  );
}

/**
 * The pull requests the watcher would warn about or hand to review now:
 * the ones worth comparing, so each head is compared about once.
 */
async function dueOf(
  task: WatchedTask,
  pulls: readonly PullFacts[],
  memory: Memory,
  reads: Reads,
): Promise<PullFacts[]> {
  const refused = await refusedOf(pulls, memory, reads);
  const due = [
    ...pushedAfterApproval(pulls, memory).map(({ pull }) => pull),
    ...waitingForReview(task, pulls, memory, refused),
  ];
  return [...new Map(due.map((pull) => [pullId(pull), pull])).values()];
}

/** Of the due pull requests, the ones rebased after their approval with no reason (HAL-18722). */
async function unneededOf(
  due: readonly PullFacts[],
  memory: Memory,
  reads: Reads,
): Promise<Unneeded[]> {
  const found = await Promise.all(
    due.map(async (pull): Promise<Unneeded[]> => {
      const since = await reads.sinceOf(pull);
      return since !== undefined && unneeded(pull, since, memory) ? [{ pull, since }] : [];
    }),
  );
  return found.flat();
}

/** Notes the unneeded rebases on the task, waking nobody; the memory with their keys added. */
async function flagUnneeded(
  options: ReviewStepOptions,
  task: WatchedTask,
  found: readonly Unneeded[],
  memory: Memory,
): Promise<Memory> {
  const body = unneededMessage(found);
  options.log(`${task.identifier}: unneeded rebase${options.dryRun ? " (dry run)" : ""}\n${body}`);
  if (!options.dryRun) {
    await options.paperclip.note(task.id, body);
  }
  const keys = found.map(({ pull }) => unneededKey(pull));
  return { ...memory, reported: new Set([...memory.reported, ...keys]) };
}

/** Of the due pull requests, the ones whose approval carries to the current head (HAL-18460). */
async function carriedOf(
  due: readonly PullFacts[],
  memory: Memory,
  reads: Reads,
): Promise<Carried[]> {
  const unique = due.filter((pull) => !memory.reported.has(carryKey(pull)));
  const found = await Promise.all(
    unique.map(async (pull): Promise<Carried[]> => {
      const since = await reads.sinceOf(pull);
      if (since === undefined || !carries(pull, since, (await reads.routeOf(pull)).reviewer)) {
        return [];
      }
      return [{ pull, since, pushedKey: pushedKey(pull, since.approvedHead) }];
    }),
  );
  return found.flat();
}

/** Records the carry-overs on the task, waking nobody; the memory with their keys added. */
async function carry(
  options: ReviewStepOptions,
  task: WatchedTask,
  carried: readonly Carried[],
  memory: Memory,
): Promise<Memory> {
  const body = carriedMessage(carried);
  options.log(`${task.identifier}: carried over${options.dryRun ? " (dry run)" : ""}\n${body}`);
  if (!options.dryRun) {
    await options.paperclip.note(task.id, body);
  }
  const keys = carried.flatMap(({ pull, pushedKey: key }) => [carryKey(pull), key]);
  return { ...memory, reported: new Set([...memory.reported, ...keys]) };
}

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

/**
 * The reviewer of one pull request: Julian for a rebase-only push since
 * Liam's approval, whose re-approval counts on any path the rebase rule
 * allows (`julianRebaseRefusal`, HAL-18459); otherwise the reviewer of its paths.
 */
async function reviewerAfter(
  pull: PullFacts,
  since: SinceApproval | undefined,
  reads: Reads,
): Promise<Reviewer> {
  const paths = await reads.routeOf(pull);
  const rebaseAfterLiam = since?.rebaseOnly === true && since.by === "Liam";
  return rebaseAfterLiam && paths.rebaseRefusal === null ? "julian" : paths.reviewer;
}

async function handOff(
  options: ReviewStepOptions,
  task: WatchedTask,
  pulls: readonly PullFacts[],
  memory: Memory,
  reads: Reads,
): Promise<boolean> {
  const refused = await refusedOf(pulls, memory, reads);
  const answers = answersOf(options, task, pulls, memory);
  const waiting = waitingForReview(task, pulls, memory, refused, answers);
  const [first] = waiting;
  if (first === undefined || task.assigneeAgentId === null) {
    return false;
  }
  const since: SinceApprovals = new Map(
    (
      await Promise.all(
        waiting.map(async (pull) => [pullId(pull), await reads.sinceOf(pull)] as const),
      )
    ).filter((entry): entry is [string, SinceApproval] => entry[1] !== undefined),
  );
  const byPull = await Promise.all(
    waiting.map((pull) => reviewerAfter(pull, since.get(pullId(pull)), reads)),
  );
  const author = branchOwner(first.branch);
  const blocking = blockingReviewer(waiting.filter((pull) => answers.has(pullId(pull))));
  const reviewer = reviewerAfterAnswer(author, blocking, reviewerOf(author, byPull));
  const to = options.owners.get(reviewer);
  if (to === undefined) {
    options.log(`${task.identifier}: ready for review, but Paperclip has no agent ${reviewer}`);
    return false;
  }
  const body = handoffMessage(waiting, reviewer, refused, since, answers);
  options.log(`${task.identifier}: to ${reviewer}${options.dryRun ? " (dry run)" : ""}\n${body}`);
  if (options.dryRun) {
    return true;
  }
  const key = waiting.map((pull) => handoffKey(pull, refused, answers)).join(" | ");
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
 * Whether the pull requests alone say a review step may apply, before the
 * task's comments are read: a push after an approval, a task ready for
 * review, or an open finding the author may have answered.
 */
function mayApply(task: WatchedTask, pulls: readonly PullFacts[]): boolean {
  // Every Julian-only approval counts as refused here, the widest case.
  const suspects: Refused = new Set(
    pulls.filter((pull) => julianOnlyOnHead(pull, noMemory)).map(pullId),
  );
  // Every finding counts as answered here: whether the author replied is in the comments.
  const anyAnswer: Answers = new Map(
    pulls.filter((pull) => pull.latestReview !== undefined).map((pull) => [pullId(pull), "reply"]),
  );
  return (
    pushedAfterApproval(pulls, noMemory).length > 0 ||
    waitingForReview(task, pulls, noMemory, suspects, anyAnswer).length > 0
  );
}

/**
 * For a task its author holds with no run going, and nothing else to tell
 * them: notes a rebase after an approval that nothing asked for, records
 * an approval that carries over a rebase, warns once about
 * any other push after an approval, then hands the task to its reviewer
 * when every open pull request is ready, or back to the reviewer who asked
 * for changes once the author answered. The task's comments are read only
 * when the pull requests alone say one of them may apply.
 */
export async function reviewSteps(
  options: ReviewStepOptions,
  task: WatchedTask,
  pulls: readonly PullFacts[],
  readMemory: () => Promise<Memory>,
): Promise<ReviewStepOutcome> {
  if (!mayApply(task, pulls)) {
    return nothing;
  }
  let memory = await readMemory();
  if (options.route === undefined) {
    const warned = await warn(options, task, pulls, memory);
    if (waitingForReview(task, pulls, memory).length > 0) {
      options.log(`${task.identifier}: ready for review, but no reviewer route is set`);
    }
    return { ...nothing, warned };
  }
  const reads = readsOf(options, task, options.route);
  const due = await dueOf(task, pulls, memory, reads);
  const rebased = await unneededOf(due, memory, reads);
  if (rebased.length > 0) {
    memory = await flagUnneeded(options, task, rebased, memory);
  }
  const carried = await carriedOf(due, memory, reads);
  if (carried.length > 0) {
    memory = await carry(options, task, carried, memory);
  }
  const warned = await warn(options, task, pulls, memory);
  const handedOff = await handOff(options, task, pulls, memory, reads);
  return { handedOff, warned };
}
