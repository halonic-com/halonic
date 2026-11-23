import { type AutoEffort, effortForTask, tagsFromLabels } from "./rules.ts";

/**
 * What the task effort handler does about one task after it changed
 * (requirements `paperclip.task-effort-guard` and `paperclip.task-effort-writes`).
 *
 * Core doesn't check who may set a task's effort, so the handler keeps its
 * own record of what it wrote and treats every other change as someone
 * else's. A task whose effort someone else set or changed is theirs from
 * then on: the handler never writes on it again, so it never raises (or
 * lowers) an effort a person chose.
 */

/** What the handler keeps per task between events. */
export interface EffortRecord {
  /** The effort the handler last wrote and that is still in place, or null for none. */
  readonly set: AutoEffort | null;
  /** The task's effort as the handler last saw it, or null when it had none. */
  readonly seen: string | null;
  /** The agent the task was assigned to when last seen, to spot a reviewer's hand-back. */
  readonly assigneeAgentId: string | null;
  /** A reviewer handed it back without an approval at least once. */
  readonly sentBack: boolean;
  /** Someone other than the handler set or changed its effort, so the handler leaves it alone. */
  readonly handsOff: boolean;
}

/** The task as it is now. */
export interface TaskNow {
  /** `assigneeAdapterOverrides.adapterConfig.effort`, or null when there is none. */
  readonly effort: string | null;
  readonly labelNames: readonly string[];
  readonly assigneeAgentId: string | null;
}

/** An effort change the handler didn't make. */
export interface ForeignChange {
  readonly from: string | null;
  readonly to: string | null;
}

/** The handler's decision for one event. */
export interface EffortDecision {
  /** The effort to write, null to take the handler's own effort off again, or undefined for no write. */
  readonly write: AutoEffort | null | undefined;
  /** Set when the task's effort changed and the handler didn't change it. */
  readonly foreign: ForeignChange | undefined;
  /** The record to keep if the write goes out, or as it is when there is none. */
  readonly record: EffortRecord;
  /** The record to keep when the write is only logged (switch off) or fails. */
  readonly recordUnwritten: EffortRecord;
}

/**
 * The effort change since the handler last looked, if it didn't make it.
 * A task it sees for the first time counts only when it was just created
 * with an effort: older tasks weren't watched, so their effort has no "before".
 */
function foreignChange(
  task: TaskNow,
  before: EffortRecord | undefined,
  created: boolean,
): ForeignChange | undefined {
  if (before === undefined) {
    return created && task.effort !== null ? { from: null, to: task.effort } : undefined;
  }
  return task.effort === before.seen ? undefined : { from: before.seen, to: task.effort };
}

/** Decides what to do for a task that was created or changed. */
export function decideEffort(
  task: TaskNow,
  before: EffortRecord | undefined,
  input: { readonly created: boolean; readonly sentBackNow: boolean },
): EffortDecision {
  const foreign = foreignChange(task, before, input.created);
  const ours = before !== undefined && before.set !== null && task.effort === before.set;
  // An effort the handler finds on a task it never wrote is someone else's, change or not.
  const handsOff =
    (before?.handsOff ?? false) || foreign !== undefined || (task.effort !== null && !ours);
  const sentBack = (before?.sentBack ?? false) || input.sentBackNow;
  const unchanged: EffortRecord = {
    set: ours && !handsOff ? (before?.set ?? null) : null,
    seen: task.effort,
    assigneeAgentId: task.assigneeAgentId,
    sentBack,
    handsOff,
  };
  const wanted = effortForTask(tagsFromLabels(task.labelNames, sentBack)) ?? null;
  const write =
    handsOff || task.assigneeAgentId === null || wanted === task.effort ? undefined : wanted;
  if (write === undefined) {
    return { write, foreign, record: unchanged, recordUnwritten: unchanged };
  }
  return {
    write,
    foreign,
    record: { ...unchanged, set: write, seen: write },
    recordUnwritten: unchanged,
  };
}

/**
 * Whether a reviewer's comment is a signed approval (HAL-14809), such as
 * "Julian: approved on head `abc1234`" or "re-approved on head".
 */
export function isApproval(body: string): boolean {
  return /\bapproved on head\b/i.test(body);
}
