import type { Snapshot } from "../snapshot/shape.ts";
import { type ConflictFileMap, type ConflictFiles, conflictFilesOf } from "./conflict-files.ts";
import {
  branchesOwner,
  candidates,
  marker,
  newReasons,
  type PullFacts,
  type Reason,
  short,
} from "./decide.ts";
import type { FoundPulls, PullRef } from "./discover.ts";
import { type PullFactsReader, pullKey } from "./facts.ts";
import { readMemory } from "./memory.ts";
import { wakeMessage } from "./messages.ts";
import type { AgentRow, CommentRow, WriteOutcome } from "./paperclip.ts";

/**
 * Done tasks whose pull request is still open (HAL-18284; HAL-17515 was done
 * while #6033 conflicted for 11 hours). The watcher's tick reads open tasks
 * only, so this pass takes the tasks a branch with an open pull request names
 * that the tick didn't list. A conflicting one goes back to `todo` and wakes
 * its author with the conflicting files; any other gets one warning comment
 * per head. The author's line `PR watcher: moved to HAL-<n>` stops both.
 */

/** A task as this pass reads it, by identifier. */
export interface DoneTaskRow {
  readonly id: string;
  readonly status: string;
  readonly assigneeAgentId: string | null;
  readonly running: boolean;
}

/** The pass's view of Paperclip. */
export interface DoneOpenHost {
  /** The task an identifier names, or undefined when there is none. */
  task(identifier: string): Promise<DoneTaskRow | undefined>;
  comments(taskId: string): Promise<CommentRow[]>;
  agents(): Promise<AgentRow[]>;
  /** Moves a task that is still done to `todo`, comments and wakes its assignee; `closed` otherwise. */
  reopen(taskId: string, body: string, key: string): Promise<WriteOutcome>;
  /** Comments on a task that is still done and wakes nobody; `closed` otherwise. */
  warn(taskId: string, body: string): Promise<WriteOutcome>;
}

/** What one pass needs. */
export interface DoneOpenOptions {
  readonly host: DoneOpenHost;
  readonly found: FoundPulls;
  /** The pull requests that are open, by `pullKey`. */
  readonly openPulls: ReadonlySet<string>;
  /** The identifiers of the tasks the tick read as open. */
  readonly openTasks: ReadonlySet<string>;
  readonly facts: PullFactsReader;
  readonly conflictFiles?: ConflictFiles;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
}

/** How a pass went. */
export interface DoneOpenSummary {
  readonly reopened: number;
  readonly warned: number;
  readonly failed: readonly string[];
}

/** The open pull requests in a snapshot, by `pullKey`. */
export function openPullKeys(snapshot: Snapshot): ReadonlySet<string> {
  return new Set(
    snapshot.repos.flatMap(({ repo, pulls }) =>
      pulls
        .filter((pull) => pull.state === "open")
        .map((pull) => pullKey({ repo, number: pull.number })),
    ),
  );
}

/** The warning's key for one open pull request's head. */
function warnKey(pull: PullFacts): string {
  return `${pull.repo}#${pull.number} ${short(pull.head)} open after done`;
}

/** The comment for a done task whose pull request conflicts: back to `todo`, then the usual wake lines. */
function reopenMessage(reasons: readonly Reason[], files: ConflictFileMap): string {
  return [
    "PR watcher: this task is done, but a pull request on its branch is still open, so it is back in `todo`.",
    "",
    wakeMessage(reasons, undefined, files),
  ].join("\n");
}

/** The warning for a done task whose pull requests are open. */
function warnMessage(pulls: readonly PullFacts[]): string {
  const links = pulls.map((pull) => `[#${pull.number}](${pull.url})`).join(", ");
  return [
    `PR watcher: this task is done, but ${links} on its branch is still open. Close it, or if it moved to another task, add the line \`PR watcher: moved to HAL-<n>\` to a comment here.`,
    "",
    ...pulls.map((pull) => marker(warnKey(pull))),
  ].join("\n");
}

type Outcome = "reopened" | "warned" | undefined;

/** Writes one step unless it is a dry run; what it did. */
async function write(
  options: DoneOpenOptions,
  identifier: string,
  step: {
    readonly outcome: Outcome;
    readonly body: string;
    readonly run: () => Promise<WriteOutcome>;
  },
): Promise<Outcome> {
  options.log(`${identifier}: ${step.outcome}${options.dryRun ? " (dry run)" : ""}\n${step.body}`);
  if (options.dryRun) {
    return step.outcome;
  }
  return (await step.run()) === "written" ? step.outcome : undefined;
}

/** Checks one done task with open pull requests and writes what it needs. */
async function checkTask(
  options: DoneOpenOptions,
  identifier: string,
  refs: readonly PullRef[],
  owners: ReadonlyMap<string, string>,
): Promise<Outcome> {
  const task = await options.host.task(identifier);
  if (task?.status !== "done") {
    return undefined;
  }
  const pulls = [...(await options.facts(refs)).values()].filter((pull) => pull.state === "open");
  const ownerId = owners.get(branchesOwner(refs.map((ref) => ref.branch)) ?? "");
  const memory = readMemory(await options.host.comments(task.id), ownerId ?? "");
  if (memory.movedTo !== undefined) {
    options.log(`${identifier}: done, its pull request moved to ${memory.movedTo}`);
    return undefined;
  }
  const conflicts = newReasons(
    candidates(pulls).filter((reason) => reason.kind === "conflict"),
    memory,
  );
  if (conflicts.length > 0 && ownerId !== undefined && task.assigneeAgentId === ownerId) {
    const files = await conflictFilesOf(conflicts, options.conflictFiles, options.log);
    const body = reopenMessage(conflicts, files);
    const key = `done-open ${conflicts.map((reason) => reason.key).join(" | ")}`;
    const run = () => options.host.reopen(task.id, body, key);
    return write(options, identifier, { outcome: "reopened", body, run });
  }
  const unwarned = pulls.filter((pull) => !memory.reported.has(warnKey(pull)));
  if (unwarned.length === 0) {
    return undefined;
  }
  const body = warnMessage(unwarned);
  return write(options, identifier, {
    outcome: "warned",
    body,
    run: () => options.host.warn(task.id, body),
  });
}

/**
 * One pass over the tasks that a branch with an open pull request names and
 * that the tick didn't read as open. A task that fails is logged and skipped.
 */
export async function doneOpenPass(options: DoneOpenOptions): Promise<DoneOpenSummary> {
  const wanted = [...options.found].flatMap(([identifier, refs]) => {
    const open = refs.filter((ref) => options.openPulls.has(pullKey(ref)));
    return options.openTasks.has(identifier) || open.length === 0 ? [] : [{ identifier, open }];
  });
  const counts = { reopened: 0, warned: 0 };
  const failed: string[] = [];
  if (wanted.length === 0) {
    return { ...counts, failed };
  }
  const owners = new Map((await options.host.agents()).map((agent) => [agent.urlKey, agent.id]));
  for (const { identifier, open } of wanted) {
    try {
      const outcome = await checkTask(options, identifier, open, owners);
      if (outcome !== undefined) {
        counts[outcome] += 1;
      }
    } catch (error) {
      failed.push(identifier);
      options.log(`${identifier}: couldn't check the done task: ${(error as Error).message}`);
    }
  }
  return { ...counts, failed };
}
