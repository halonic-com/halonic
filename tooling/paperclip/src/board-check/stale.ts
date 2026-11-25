import { amsterdamTime } from "../amsterdam-time.ts";
import type { BoardWrite } from "./writes.ts";

/**
 * The board check's stale-task part (HAL-17732): sorts every open task into
 * one verdict, so a task the board holds is never taken for a stuck one, a
 * standing duty is never flagged, and a todo nobody holds reaches Chief.
 * Paperclip records no trace of the delegation-cycle guard on a task, so a
 * no-owner child an agent created counts as the guard's: an agent always
 * names an assignee, and the guard is what drops it. Verdicts carry ids,
 * identifiers and times, never a title or any other text an agent wrote.
 */

/** A todo nobody holds for this long goes to Chief. */
export const noOwnerHours = 4;
/** An agent's task in review untouched for this long is a slow review. */
export const slowReviewHours = 8;
/**
 * How long an agent's todo or task in progress may sit untouched, with no
 * run, per task its owner holds: a builder with 8 tasks on a 15-minute
 * heartbeat reaches each one only every few hours (the board, 25 Nov).
 */
export const stuckHoursPerTask = 1;
/** The least a task sits untouched before it is stuck, however few tasks its owner holds. */
export const stuckFloorHours = 4;

const hourMs = 3_600_000;

/** The statuses that count towards an agent's load: tasks it holds and works on. */
const loadStatuses = new Set(["todo", "in_progress", "in_review"]);

/** The task fields the stale part reads, as the pass's listing shows them. */
export interface StaleTask {
  readonly id: string;
  readonly identifier: string | null;
  readonly status: string;
  readonly assigneeAgentId: string | null;
  readonly assigneeUserId: string | null;
  readonly parentId?: string | null;
  readonly createdByAgentId?: string | null;
  readonly originKind?: string | null;
  readonly unblockDescriptor?: unknown;
  readonly monitorNextCheckAt?: Date | string | null;
  readonly activeRun?: unknown;
  readonly blockedBy?: readonly unknown[];
  readonly createdAt?: Date | string;
  readonly updatedAt: Date | string;
  readonly lastActivityAt?: Date | string | null;
}

/** What the stuck check knows beyond the task itself. */
export interface StuckContext {
  /** Agent id → how many open tasks it holds. */
  readonly load: ReadonlyMap<string, number>;
  /** Identifiers of tasks with an open pull request on their branch. */
  readonly openPulls: ReadonlySet<string>;
}

/** Why a todo has no owner. */
export type NoOwnerReason = "cycle guard" | "missing assignee";

/** What the stale part makes of one open task. */
export type StaleVerdict =
  | { readonly kind: "waiting_on_board" }
  | { readonly kind: "standing" }
  | { readonly kind: "no_owner"; readonly reason: NoOwnerReason }
  | { readonly kind: "stuck" }
  | { readonly kind: "slow_review" }
  | { readonly kind: "fine" };

const hoursSince = (time: Date | string, now: Date) =>
  (now.getTime() - new Date(time).getTime()) / hourMs;

/** A task that waits by design: a stated unblock, a routine's run, or a scheduled monitor. */
function standing(task: StaleTask): boolean {
  return (
    task.unblockDescriptor != null ||
    task.originKind === "routine_execution" ||
    task.monitorNextCheckAt != null
  );
}

/** The guard's footprint when there is one, else a plain missing assignee. */
export function noOwnerReason(task: StaleTask): NoOwnerReason {
  return task.parentId != null && task.createdByAgentId != null
    ? "cycle guard"
    : "missing assignee";
}

/** How many open tasks each agent holds. */
export function agentLoad(tasks: readonly StaleTask[]): Map<string, number> {
  const load = new Map<string, number>();
  for (const task of tasks) {
    if (task.assigneeAgentId !== null && loadStatuses.has(task.status)) {
      load.set(task.assigneeAgentId, (load.get(task.assigneeAgentId) ?? 0) + 1);
    }
  }
  return load;
}

/** How long a task of an owner holding `load` open tasks may sit untouched before it is stuck. */
export function stuckAfterHours(load: number): number {
  return Math.max(stuckFloorHours, load * stuckHoursPerTask);
}

/** The later of the task's last change and its last activity (a comment, a run). */
function lastTouch(task: StaleTask): Date {
  const updated = new Date(task.updatedAt);
  const active = task.lastActivityAt == null ? undefined : new Date(task.lastActivityAt);
  return active !== undefined && active > updated ? active : updated;
}

/** An agent's todo or task in progress with no run, no blocker and no open pull request, untouched too long. */
function isStuck(task: StaleTask, agentId: string, now: Date, context: StuckContext): boolean {
  const working = task.status === "todo" || task.status === "in_progress";
  const waitsOnOthers =
    (task.blockedBy?.length ?? 0) > 0 ||
    (task.identifier !== null && context.openPulls.has(task.identifier));
  if (!working || waitsOnOthers || task.activeRun != null) {
    return false;
  }
  return hoursSince(lastTouch(task), now) >= stuckAfterHours(context.load.get(agentId) ?? 1);
}

/** Sorts one open task. The board's tasks come first: they are never stuck or ownerless. */
export function staleVerdict(task: StaleTask, now: Date, context: StuckContext): StaleVerdict {
  if (task.assigneeAgentId === null && task.assigneeUserId != null) {
    return { kind: "waiting_on_board" };
  }
  if (standing(task)) {
    return { kind: "standing" };
  }
  if (task.assigneeAgentId === null) {
    const age = hoursSince(task.createdAt ?? task.updatedAt, now);
    return task.status === "todo" && age >= noOwnerHours
      ? { kind: "no_owner", reason: noOwnerReason(task) }
      : { kind: "fine" };
  }
  if (task.status === "in_review") {
    const idle = hoursSince(task.updatedAt, now);
    return idle >= slowReviewHours ? { kind: "slow_review" } : { kind: "fine" };
  }
  return isStuck(task, task.assigneeAgentId, now, context) ? { kind: "stuck" } : { kind: "fine" };
}

/** A todo with no owner, as Chief hears of it. */
export interface NoOwnerTask {
  readonly taskId: string;
  readonly identifier: string;
  readonly reason: NoOwnerReason;
  /** When the task was created, as an ISO time. */
  readonly since: string;
}

/** What the stale part keeps in plugin state after each hourly pass. */
export interface StaleRecord {
  readonly at: string | null;
  /** Identifiers per verdict, for whoever reads the lists. */
  readonly waitingOnBoard: readonly string[];
  readonly stuck: readonly string[];
  readonly slowReview: readonly string[];
  readonly noOwner: readonly NoOwnerTask[];
  /** Task ids Chief was already woken for; a task leaves once it has an owner. */
  readonly woken: readonly string[];
}

export const emptyStale: StaleRecord = {
  at: null,
  waitingOnBoard: [],
  stuck: [],
  slowReview: [],
  noOwner: [],
  woken: [],
};

/** Reads the record from plugin state; anything malformed starts it afresh. */
export function readStale(value: unknown): StaleRecord {
  const record = (value ?? {}) as Partial<StaleRecord>;
  const woken = Array.isArray(record.woken)
    ? record.woken.filter((taskId): taskId is string => typeof taskId === "string")
    : [];
  return { ...emptyStale, woken };
}

/** Sorts every open task with an identifier into the record's lists. */
export function sortStale(
  tasks: readonly StaleTask[],
  now: Date,
  openPulls: ReadonlySet<string> = new Set(),
) {
  const context: StuckContext = { load: agentLoad(tasks), openPulls };
  const lists = {
    waitingOnBoard: [] as string[],
    stuck: [] as string[],
    slowReview: [] as string[],
  };
  const noOwner: NoOwnerTask[] = [];
  for (const task of tasks) {
    if (task.identifier === null) {
      continue;
    }
    const verdict = staleVerdict(task, now, context);
    if (verdict.kind === "waiting_on_board") {
      lists.waitingOnBoard.push(task.identifier);
    } else if (verdict.kind === "stuck") {
      lists.stuck.push(task.identifier);
    } else if (verdict.kind === "slow_review") {
      lists.slowReview.push(task.identifier);
    } else if (verdict.kind === "no_owner") {
      const since = new Date(task.createdAt ?? task.updatedAt).toISOString();
      noOwner.push({ taskId: task.id, identifier: task.identifier, reason: verdict.reason, since });
    }
  }
  return { ...lists, noOwner };
}

/** What the stale part wants written this pass, and the records to save. */
export interface StalePlan {
  readonly writes: readonly BoardWrite[];
  readonly record: StaleRecord;
  /** The record when the writes only got logged: the new tasks count as not reported yet. */
  readonly recordIfUnsent: StaleRecord;
}

/**
 * One comment on Chief's task naming each no-owner todo not reported yet,
 * with its reason, and one wake so Chief reads it. `room` is what the gate's
 * ceilings leave after the pass's other parts: with no room for both, the
 * part waits for the next hour rather than tip the whole pass over.
 */
export function planStale(
  previous: StaleRecord,
  tasks: readonly StaleTask[],
  options: {
    readonly chiefTaskId: string | undefined;
    readonly room: { readonly comment: number; readonly wake: number };
    readonly now: Date;
    /** Identifiers of tasks with an open pull request; none when unknown. */
    readonly openPulls?: ReadonlySet<string>;
  },
): StalePlan {
  const sorted = sortStale(tasks, options.now, options.openPulls);
  const owned = sorted.noOwner.map((task) => task.taskId);
  const kept = previous.woken.filter((taskId) => owned.includes(taskId));
  const fresh = sorted.noOwner.filter((task) => !kept.includes(task.taskId));
  const unsent: StaleRecord = { at: options.now.toISOString(), ...sorted, woken: kept };
  const { chiefTaskId, room } = options;
  if (fresh.length === 0 || chiefTaskId === undefined || room.comment < 1 || room.wake < 1) {
    return { writes: [], record: unsent, recordIfUnsent: unsent };
  }
  const lines = fresh.map(
    (task) => `- ${task.identifier}: ${task.reason}, no owner since ${amsterdamTime(task.since)}`,
  );
  const writes: BoardWrite[] = [
    {
      kind: "comment",
      taskId: chiefTaskId,
      body: [
        `Todos with no owner for ${noOwnerHours} hours or more; please pick one:`,
        ...lines,
      ].join("\n"),
    },
    {
      kind: "wake",
      taskId: chiefTaskId,
      reason: "board_check_no_owner",
      key: `board-check-no-owner:${options.now.toISOString()}`,
    },
  ];
  const woken = [...kept, ...fresh.map((task) => task.taskId)];
  return { writes, record: { ...unsent, woken }, recordIfUnsent: unsent };
}
