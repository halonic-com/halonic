import {
  branchOwner,
  candidates,
  type Decision,
  decide,
  type Memory,
  type PullFacts,
  type Reason,
} from "./decide.ts";
import { type BaseGreenSince, baseGreenSince, pullFacts } from "./facts.ts";
import { type GitHubGet, parsePullUrl } from "./github.ts";
import type { CommentRow, Paperclip, TaskRow } from "./paperclip.ts";

/** What one tick needs. `selfId` is the watcher's own agent id. */
export interface TickOptions {
  readonly paperclip: Paperclip;
  readonly get: GitHubGet;
  readonly selfId: string;
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

const markerPattern = /<!-- pr-watcher: (.+?) -->/g;

/** The hidden line that lets the watcher recognise a state it already reported. */
export function marker(key: string): string {
  return `<!-- pr-watcher: ${key} -->`;
}

/** What the watcher reported before, from its own comments and the author's. */
export function readMemory(
  comments: readonly CommentRow[],
  selfId: string,
  ownerId: string,
): Memory {
  const reported = new Set<string>();
  let seenUntil: string | undefined;
  for (const comment of comments) {
    if (comment.authorAgentId === selfId) {
      for (const match of comment.body.matchAll(markerPattern)) {
        reported.add(match[1] ?? "");
      }
    }
    const counts = comment.authorAgentId === selfId || comment.authorAgentId === ownerId;
    if (counts && (seenUntil === undefined || comment.createdAt > seenUntil)) {
      seenUntil = comment.createdAt;
    }
  }
  return { reported, seenUntil };
}

const reasonText: Record<Reason["kind"], (head: string) => string> = {
  "ci-red": (head) => `\`ci-ok\` failed on its head \`${head}\`.`,
  conflict: () => "it conflicts with its base branch and isn't in the merge queue.",
  review: (head) => `there's a new review comment on its head \`${head}\`.`,
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

async function decideTask(
  options: TickOptions,
  task: TaskRow,
  owners: ReadonlyMap<string, string>,
  greenSince: BaseGreenSince,
): Promise<Decision | undefined> {
  const refs = (await options.paperclip.pullLinks(task.id)).flatMap(
    (url) => parsePullUrl(url) ?? [],
  );
  if (refs.length === 0) {
    return undefined;
  }
  const pulls = await Promise.all(refs.map((ref) => pullFacts(options.get, ref, greenSince)));
  const ownerKey = branchOwner(pulls[0]?.branch ?? "");
  const ownerId = ownerKey === undefined ? undefined : owners.get(ownerKey);
  const needsMemory =
    ownerId !== undefined && ownerId === task.assigneeAgentId && candidates(pulls).length > 0;
  const memory = needsMemory
    ? readMemory(await options.paperclip.comments(task.id), options.selfId, ownerId)
    : { reported: new Set<string>(), seenUntil: undefined };
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
    await options.paperclip.comment(task.id, body);
  }
}

/**
 * One pass over every open task with a linked pull request. A task that
 * fails to read is reported and skipped, so one broken link doesn't stop
 * the others.
 */
export async function tick(options: TickOptions): Promise<TickSummary> {
  const owners = new Map(
    (await options.paperclip.agents()).map((agent) => [agent.urlKey, agent.id]),
  );
  const counts = { checked: 0, done: 0, woken: 0 };
  const failed: string[] = [];
  // One read of each base branch's tip per tick, shared by every task.
  const greenSince = baseGreenSince(options.get);
  for (const task of await options.paperclip.openTasks()) {
    try {
      const decision = await decideTask(options, task, owners, greenSince);
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
