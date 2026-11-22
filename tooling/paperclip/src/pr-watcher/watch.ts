import {
  branchesOwner,
  candidates,
  closedOutcome,
  type Decision,
  decide,
  type Memory,
  type PullFacts,
  type Reason,
} from "./decide.ts";
import type { FoundPulls } from "./discover.ts";
import { type BaseGreenSince, baseGreenSince, pullFacts } from "./facts.ts";
import type { GitHubGet } from "./github.ts";
import type { CommentRow, Paperclip, TaskRow } from "./paperclip.ts";

/** What one tick needs. `discover` finds each task's pull requests by branch. */
export interface TickOptions {
  readonly paperclip: Paperclip;
  readonly get: GitHubGet;
  readonly discover: () => Promise<FoundPulls>;
  /** Print what it would do, write nothing. */
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
}

/** How a tick went: counts, and the tasks it couldn't check. */
export interface TickSummary {
  readonly checked: number;
  readonly done: number;
  readonly woken: number;
  readonly failed: readonly string[];
}

/** What every task in one tick shares: agents by short name, found pull requests, base runs. */
interface TickRefs {
  readonly owners: ReadonlyMap<string, string>;
  readonly found: FoundPulls;
  readonly greenSince: BaseGreenSince;
}

const emptyMemory: Memory = {
  reported: new Set<string>(),
  seenUntil: undefined,
  held: false,
  lastCommentAt: undefined,
};

const markerPattern = /<!-- pr-watcher: (.+?) -->/g;

/** The line an author puts in a task comment to keep the task open after a merge. */
const holdPattern = /^[ \t]*PR watcher: more PRs to come[ \t.]*$/im;

/** The hidden line that lets the watcher recognise a state it already reported. */
export function marker(key: string): string {
  return `<!-- pr-watcher: ${key} -->`;
}

/**
 * A comment the watcher wrote. The host stores no plugin id on a plugin's
 * comment, so it is one with neither an agent nor a user as author that
 * starts with the watcher's name.
 */
export function isSelf(comment: CommentRow): boolean {
  return (
    comment.authorAgentId === null &&
    comment.authorUserId === null &&
    comment.body.startsWith("PR watcher:")
  );
}

/** When the newest of these comments was written. */
function newestAt(comments: readonly CommentRow[]): string | undefined {
  return comments.reduce<string | undefined>(
    (newest, comment) =>
      newest === undefined || comment.createdAt > newest ? comment.createdAt : newest,
    undefined,
  );
}

/** What the watcher reported before, from its own comments and the author's. */
export function readMemory(comments: readonly CommentRow[], ownerId: string): Memory {
  const reported = new Set<string>();
  let seenUntil: string | undefined;
  for (const comment of comments) {
    const self = isSelf(comment);
    if (self) {
      for (const match of comment.body.matchAll(markerPattern)) {
        reported.add(match[1] ?? "");
      }
    }
    const counts = self || comment.authorAgentId === ownerId;
    if (counts && (seenUntil === undefined || comment.createdAt > seenUntil)) {
      seenUntil = comment.createdAt;
    }
  }
  const authorLast = comments
    .filter((comment) => comment.authorAgentId === ownerId)
    .reduce<CommentRow | undefined>(
      (newest, comment) =>
        newest === undefined || comment.createdAt > newest.createdAt ? comment : newest,
      undefined,
    );
  return {
    reported,
    seenUntil,
    held: holdPattern.test(authorLast?.body ?? ""),
    lastCommentAt: newestAt(comments.filter((comment) => !isSelf(comment))),
  };
}

const reasonText: Record<Reason["kind"], (head: string) => string> = {
  "ci-red": (head) => `\`ci-ok\` failed on its head \`${head}\`.`,
  conflict: () => "it conflicts with its base branch and isn't in the merge queue.",
  review: (head) => `there's a new review comment on its head \`${head}\`.`,
  merged: () =>
    "it merged and `ci-ok` is green, but the task has comments since. Mark it done if nothing else is left.",
};

/** The comment that wakes the author: one line per new state, each with its marker. */
export function wakeMessage(reasons: readonly Reason[]): string {
  const lines = reasons.map(
    ({ pull, kind }) =>
      `- [#${pull.number}](${pull.url}): ${reasonText[kind](pull.head.slice(0, 7))}`,
  );
  return [
    "PR watcher: this needs you.",
    "",
    ...lines,
    "",
    ...reasons.map((reason) => marker(reason.key)),
  ].join("\n");
}

/** The comment that closes the task. */
export function doneMessage(pulls: readonly PullFacts[]): string {
  const links = pulls.map((pull) => `[#${pull.number}](${pull.url})`).join(", ");
  return `PR watcher: ${links} merged and \`ci-ok\` is green on the base branch, so this task is done.`;
}

/** The agent every branch names, by its id, when there is one and Paperclip knows it. */
function ownerOf(branches: readonly string[], owners: ReadonlyMap<string, string>) {
  const key = branchesOwner(branches);
  return key === undefined ? undefined : owners.get(key);
}

async function decideTask(
  options: TickOptions,
  task: TaskRow,
  refs: TickRefs,
): Promise<Decision | undefined> {
  const found = refs.found.get(task.identifier) ?? [];
  if (found.length === 0) {
    return undefined;
  }
  // Checked on the branch names first, so a task the reviewer holds costs no GitHub reads.
  const listedOwner = ownerOf(
    found.map((ref) => ref.branch),
    refs.owners,
  );
  if (listedOwner === undefined || listedOwner !== task.assigneeAgentId || task.running) {
    return decide(task, listedOwner, [], emptyMemory);
  }
  const pulls = await Promise.all(found.map((ref) => pullFacts(options.get, ref, refs.greenSince)));
  const ownerId = ownerOf(
    pulls.map((pull) => pull.branch),
    refs.owners,
  );
  // Comments are read only when a decision depends on them: a wake, or a done the author may hold.
  const needsMemory =
    ownerId !== undefined &&
    ownerId === task.assigneeAgentId &&
    (candidates(pulls).length > 0 || closedOutcome(pulls)?.kind === "done");
  const memory = needsMemory
    ? readMemory(await options.paperclip.comments(task.id), ownerId)
    : emptyMemory;
  return decide(task, ownerId, pulls, memory);
}

async function act(options: TickOptions, task: TaskRow, decision: Decision): Promise<void> {
  if (decision.kind === "skip") {
    options.log(`${task.identifier}: nothing to do (${decision.why})`);
    return;
  }
  const body =
    decision.kind === "done" ? doneMessage(decision.pulls) : wakeMessage(decision.reasons);
  options.log(`${task.identifier}: ${decision.kind}${options.dryRun ? " (dry run)" : ""}\n${body}`);
  if (options.dryRun) {
    return;
  }
  if (decision.kind === "done") {
    await options.paperclip.markDone(task.id, body);
  } else {
    const key = decision.reasons.map((reason) => reason.key).join(" | ");
    await options.paperclip.wake(task.id, body, key);
  }
}

/**
 * One pass over every open task whose identifier a pull request's branch
 * names. A task that fails to read is reported and skipped, so one broken
 * pull request doesn't stop the others.
 */
export async function tick(options: TickOptions): Promise<TickSummary> {
  const refs: TickRefs = {
    owners: new Map((await options.paperclip.agents()).map((agent) => [agent.urlKey, agent.id])),
    found: await options.discover(),
    // One read of each base branch's newest green run per tick, shared by every task.
    greenSince: baseGreenSince(options.get),
  };
  const counts = { checked: 0, done: 0, woken: 0 };
  const failed: string[] = [];
  for (const task of await options.paperclip.openTasks()) {
    try {
      const decision = await decideTask(options, task, refs);
      if (decision === undefined) {
        continue;
      }
      counts.checked += 1;
      await act(options, task, decision);
      counts.done += decision.kind === "done" ? 1 : 0;
      counts.woken += decision.kind === "wake" ? 1 : 0;
    } catch (error) {
      failed.push(task.identifier);
      options.log(`${task.identifier}: couldn't check it: ${(error as Error).message}`);
    }
  }
  return { ...counts, failed };
}
