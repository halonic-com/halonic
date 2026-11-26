import type { CopyAgent } from "../pr-tools/approval-copy.ts";
import { judgeApprovals } from "../pr-tools/approvals.ts";
import { ToolInputError } from "../task-tools/input.ts";
import { type AuthorComment, authorOf, namesPull } from "./author.ts";
import { copyTaskOf } from "./branch.ts";
import { judgeVerdicts } from "./reader.ts";
import {
  reviewerName,
  type VerdictKind,
  type VerdictRecord,
  verdictKinds,
  verdictLine,
} from "./record.ts";
import type { VerdictStore } from "./store.ts";

/**
 * The agent tool `review_verdict` (HAL-19481, 2.1 of HAL-19228): a reviewer
 * records a verdict on a pull request's exact head. It refuses unless:
 * - the caller is one of the reviewers' agents the settings name;
 * - the calling run holds the pull request's task and is still running;
 * - that task is the one the branch names, or one that links the pull
 *   request and names its branch;
 * - the head is the pull request's current full head;
 * - it can work out who wrote the pull request (`authorOf`), and the
 *   HAL-14809 rules allow the verdict: nobody approves their own pull
 *   request, and each reviewer approves only within their limits.
 * It then adds a record and posts the verdict line on the task as the reviewer.
 */

/** One call's parameters. */
export interface VerdictCall {
  readonly repo: string;
  readonly pr: number;
  readonly task: string;
  readonly verdict: VerdictKind;
  readonly head: string;
}

/** The calling reviewer: the settings' name for the agent, and the run Paperclip named. */
export interface VerdictCaller {
  readonly reviewer: string;
  readonly agentId: string;
  readonly runId: string;
}

/** The task the reviewer names. */
export interface VerdictTask {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly description: string | null;
}

/** What the tool reads about the pull request on GitHub. */
export interface VerdictPullFacts {
  readonly state: "open" | "closed";
  readonly head: string;
  readonly branch: string;
  readonly ownBranch: boolean;
  readonly openedBy: string;
  /** The whole diff's fingerprint against the merge base (`changeIdOf`), or null. */
  readonly fingerprint: string | null;
  /** The reviewer by the path rules, as `pr_status` works it out. */
  readonly reviewer: "julian" | "liam";
  /** Why Nora's approval can't count here (`routineRefusal`), or null when it can. */
  readonly routineRefusal: string | null;
}

/** Everything the tool reads and writes, so tests can fake it. */
export interface VerdictDeps {
  /** The caller, or undefined when the settings don't name the calling agent as a reviewer. */
  readonly caller: VerdictCaller | undefined;
  /** The account every agent pushes as (`halonic-dev`). */
  readonly teamLogin: string;
  /** The task by identifier; throws a `ToolInputError` when there is none. */
  task(identifier: string): Promise<VerdictTask>;
  /** Why the calling run doesn't hold the task or isn't running, or undefined when it does and is. */
  runHolds(task: VerdictTask, caller: VerdictCaller): Promise<string | undefined>;
  pull(repo: string, pr: number): Promise<VerdictPullFacts>;
  /** The comments on the task with this identifier, or none when there is no such task. */
  taskComments(identifier: string): Promise<readonly AuthorComment[]>;
  agents(): Promise<readonly CopyAgent[]>;
  readonly store: VerdictStore;
  /** Posts the comment on the task with the caller as its author. */
  postAsCaller(taskId: string, body: string): Promise<void>;
}

/** What the tool did: the record and the line it posted. */
export interface VerdictOutcome {
  readonly record: VerdictRecord;
  readonly line: string;
  readonly task: string;
}

/** `review_verdict`'s parameters, or a `ToolInputError` saying which is wrong. */
export function readVerdictParams(params: unknown, repos: readonly string[]): VerdictCall {
  const { repo, pr, task, verdict, head } = (params ?? {}) as Record<string, unknown>;
  const chosen = typeof repo === "string" && repo !== "" ? repo : repos[0];
  if (chosen === undefined || !repos.includes(chosen)) {
    throw new ToolInputError(`repo must be one of: ${repos.join(", ")}.`);
  }
  const number = typeof pr === "string" && /^\d+$/.test(pr) ? Number(pr) : pr;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
    throw new ToolInputError("pr must be the pull request's number.");
  }
  if (typeof task !== "string" || !/^HAL-\d+$/i.test(task)) {
    throw new ToolInputError("task must be the pull request's task, such as HAL-16403.");
  }
  if (!verdictKinds.includes(verdict as VerdictKind)) {
    throw new ToolInputError(`verdict must be one of: ${verdictKinds.join(", ")}.`);
  }
  if (typeof head !== "string" || !/^[0-9a-f]{40}$/i.test(head)) {
    throw new ToolInputError("head must be the pull request's full 40-character head.");
  }
  return {
    repo: chosen,
    pr: number,
    task: task.toUpperCase(),
    verdict: verdict as VerdictKind,
    head: head.toLowerCase(),
  };
}

/** Why the task isn't the pull request's, or undefined when it is. */
function taskRefusal(
  task: VerdictTask,
  call: VerdictCall,
  pull: VerdictPullFacts,
): string | undefined {
  const branchTask = pull.ownBranch ? copyTaskOf(pull.branch) : undefined;
  if (task.identifier === branchTask) {
    return undefined;
  }
  const text = `${task.title}\n${task.description ?? ""}`;
  if (namesPull(text, call.repo, call.pr) && text.includes(pull.branch)) {
    return undefined;
  }
  const named = branchTask === undefined ? "" : ` The branch names ${branchTask}.`;
  return `${task.identifier} isn't the pull request's task: it must be the task its branch names, or one whose description links the pull request and names its branch.${named}`;
}

/** Why the HAL-14809 rules refuse the verdict, or undefined when they allow it. */
async function ruleRefusal(
  deps: VerdictDeps,
  call: VerdictCall,
  caller: VerdictCaller,
  pull: VerdictPullFacts,
  author: string,
): Promise<string | undefined> {
  const by = reviewerName(caller.reviewer);
  if (author === caller.reviewer) {
    return "it's your own pull request.";
  }
  if (call.verdict === "approved") {
    const [judged] = judgeApprovals([{ by, head: pull.head }], { ...pull, author });
    return judged?.counts === true ? undefined : `${judged?.note ?? "it doesn't count"}.`;
  }
  if (call.verdict === "withdrawn") {
    const records = await deps.store.list(call.repo, call.pr);
    const { holds } = judgeVerdicts(records, { ...pull, author });
    return holds.some((hold) => hold.by === by)
      ? undefined
      : "you have no change request on it to withdraw.";
  }
  return undefined;
}

/** Posts the stored record's line on the task as the reviewer, and returns the line. */
async function postLine(
  deps: VerdictDeps,
  task: VerdictTask,
  record: VerdictRecord,
): Promise<string> {
  const line = verdictLine(record);
  try {
    await deps.postAsCaller(
      task.id,
      `${line}\n\nRecorded with review_verdict (record \`${record.id}\`).`,
    );
  } catch (error) {
    // The record exists, so saying nothing was recorded would invite a second verdict.
    throw new ToolInputError(
      `Recorded: ${line} (record ${record.id}), but posting it on ${task.identifier} failed: ${(error as Error).message} Post that line on the task yourself; don't record it again.`,
    );
  }
  return line;
}

/** Records one verdict after every check, then posts its line on the task as the reviewer. */
export async function reviewVerdict(deps: VerdictDeps, call: VerdictCall): Promise<VerdictOutcome> {
  const { caller } = deps;
  if (caller === undefined) {
    throw new ToolInputError(
      "only the reviewers' agents the plugin's settings name record verdicts.",
    );
  }
  if (call.verdict === "security-ok" && caller.reviewer !== "julian") {
    throw new ToolInputError("only Julian records security-ok.");
  }
  const task = await deps.task(call.task);
  const notHeld = await deps.runHolds(task, caller);
  if (notHeld !== undefined) {
    throw new ToolInputError(notHeld);
  }
  const pull = await deps.pull(call.repo, call.pr);
  if (pull.state !== "open") {
    throw new ToolInputError(`${call.repo}#${call.pr} isn't open.`);
  }
  if (pull.head !== call.head) {
    throw new ToolInputError(`the pull request's head is now ${pull.head}, not ${call.head}.`);
  }
  const wrongTask = taskRefusal(task, call, pull);
  if (wrongTask !== undefined) {
    throw new ToolInputError(wrongTask);
  }
  const branchTask = pull.ownBranch ? copyTaskOf(pull.branch) : undefined;
  const taskIds = [
    ...new Set([task.identifier, ...(branchTask === undefined ? [] : [branchTask])]),
  ];
  const [agents, ...comments] = await Promise.all([
    deps.agents(),
    ...taskIds.map((identifier) => deps.taskComments(identifier)),
  ]);
  const found = authorOf({
    repo: call.repo,
    pr: call.pr,
    branch: pull.branch,
    ownBranch: pull.ownBranch,
    openedBy: pull.openedBy,
    teamLogin: deps.teamLogin,
    agents: agents as readonly CopyAgent[],
    comments: (comments as (readonly AuthorComment[])[]).flat(),
  });
  if ("refusal" in found) {
    throw new ToolInputError(`can't tell who wrote the pull request: ${found.refusal}.`);
  }
  const refused = await ruleRefusal(deps, call, caller, pull, found.author);
  if (refused !== undefined) {
    throw new ToolInputError(`the review rules (HAL-14809) refuse it: ${refused}`);
  }
  const record = await deps.store.append({
    repo: call.repo,
    pr: call.pr,
    head: pull.head,
    fingerprint: pull.fingerprint,
    verdict: call.verdict,
    reviewer: caller.reviewer,
    agentId: caller.agentId,
    runId: caller.runId,
    task: task.identifier,
  });
  const line = await postLine(deps, task, record);
  return { record, line, task: task.identifier };
}
