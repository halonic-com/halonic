import type {
  MessagingId,
  PullRequest,
  PullRequestList,
  TeamRun,
  TeamRuns,
} from "@halonicjs/ports";
import { outcomeOf } from "./activity-today.ts";
import type { ConversationRow } from "./messenger.ts";

/** After this long without a sign of work, "Last activity" turns the attention colour. */
const quietAfterMinutes = 10;

/** How a finished run ended, as the panel's tag says it. */
export type RunOutcome = "done" | "failed" | "stopped";

/** The task card: the run's task, or this chat when the run answers the person. */
export interface ActivityTask {
  /** The run answers this chat: "This chat · Answering you", with the chat's title. */
  readonly onChat: boolean;
  /** The task's short name, such as `ACME-7`; none for a chat or a task the key can't see. */
  readonly identifier?: string;
  readonly title?: string;
  readonly runId: MessagingId;
  /** The run's task; none for a run on no task. */
  readonly taskId?: MessagingId;
  /** The run's short ID, "3f9c2a", for "run 3f9c2a". */
  readonly run: string;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
}

/** What the activity panel shows for one agent (`messenger.activity-panel`). */
export type ActivityView =
  | {
      readonly kind: "working";
      readonly startedAt: Date;
      /** The last sign of work; the run's start when the source gave none. */
      readonly lastActivityAt: Date;
      /** No sign of work for 10 minutes: a fact in the attention colour, not an alarm. */
      readonly quiet: boolean;
      readonly task: ActivityTask;
      readonly pullRequests: readonly PullRequest[];
    }
  | { readonly kind: "queued"; readonly queuedAt: Date | undefined; readonly task: ActivityTask }
  | {
      readonly kind: "ended";
      readonly outcome: RunOutcome;
      readonly task: ActivityTask;
      readonly pullRequests: readonly PullRequest[];
    }
  | { readonly kind: "idle" };

/**
 * What the panel shows for `agent` from its runs and the pull requests (`messenger.activity-panel`):
 * its running run, else its queued one, else its newest finished run, else plain Idle. A running
 * run answers this chat when the chat's source says its agent works on it (`agentWorking`) and it
 * is the agent's only running run: the source names the chat's task in its own IDs, which the
 * panel can't compare with a run's task. Pull requests are those whose branch names the run's
 * task; none for a run on this chat.
 *
 * @example
 * activityView(row, runs, pulls, now).kind; // "working"
 */
export function activityView(
  row: ConversationRow,
  runs: readonly TeamRuns[],
  pulls: readonly PullRequestList[],
  now: Date,
): ActivityView {
  const agent = row.conversation.agent;
  const all = runs.flatMap((each) => each.runs).filter((run) => run.agent === agent);
  const running = all.filter((run) => run.state === "running");
  const current = newestBy(running, (run) => run.startedAt);
  if (current?.startedAt !== undefined) {
    const onChat = row.conversation.agentWorking === true && running.length === 1;
    const lastActivityAt = dateOf(current.lastActivityAt) ?? new Date(current.startedAt);
    return {
      kind: "working",
      startedAt: new Date(current.startedAt),
      lastActivityAt,
      quiet: minutesBetween(lastActivityAt, now) >= quietAfterMinutes,
      task: taskOf(current, row, onChat),
      pullRequests: onChat ? [] : pullRequestsOf(current, pulls),
    };
  }
  const queued = all.find((run) => run.state === "queued");
  if (queued !== undefined) {
    // A queued run has no start; its last sign of work is being queued, so that is its time.
    return { kind: "queued", queuedAt: dateOf(queued.lastActivityAt), task: taskOf(queued, row) };
  }
  const last = newestBy(
    all.filter((run) => run.finishedAt !== undefined),
    (run) => run.finishedAt,
  );
  if (last === undefined) return { kind: "idle" };
  return {
    kind: "ended",
    outcome: outcomeOf(last),
    task: taskOf(last, row),
    pullRequests: pullRequestsOf(last, pulls),
  };
}

/** Whole minutes from `since` to `now`, never below 0. */
export function minutesBetween(since: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
}

/** The run's card. A run on no task is this chat's only when the source says so. */
function taskOf(run: TeamRun, row: ConversationRow, onChat = false): ActivityTask {
  const startedAt = dateOf(run.startedAt);
  const finishedAt = dateOf(run.finishedAt);
  const known = onChat
    ? { title: row.conversation.title }
    : {
        ...(run.task?.identifier === undefined ? {} : { identifier: run.task.identifier }),
        ...(run.task?.title === undefined ? {} : { title: run.task.title }),
      };
  return {
    onChat,
    ...known,
    runId: run.id,
    ...(run.task === undefined ? {} : { taskId: run.task.id }),
    run: shortRun(run.id),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
  };
}

/** The open and recent pull requests whose branch names the run's task, open ones first. */
function pullRequestsOf(run: TeamRun, pulls: readonly PullRequestList[]): readonly PullRequest[] {
  const task: MessagingId | undefined = run.task?.id;
  if (task === undefined) return [];
  const open = pulls.flatMap((list) => list.open);
  const recent = pulls.flatMap((list) => list.recent);
  return [...open, ...recent].filter((pull) => pull.work === task);
}

/**
 * The run's short ID for "run 3f9c2a": the first 6 characters of the ID's last part. Shown only,
 * never used to look the run up.
 */
function shortRun(id: MessagingId): string {
  return (id.split(":").at(-1) ?? id).slice(0, 6);
}

function newestBy(runs: readonly TeamRun[], at: (run: TeamRun) => string | undefined) {
  return runs.reduce<TeamRun | undefined>(
    (newest, run) => (newest === undefined || (at(run) ?? "") > (at(newest) ?? "") ? run : newest),
    undefined,
  );
}

function dateOf(iso: string | undefined): Date | undefined {
  return iso === undefined ? undefined : new Date(iso);
}
