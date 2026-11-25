/**
 * The task effort table and its guard as a signal rule (HAL-18196, plan
 * HAL-17450 rev 5, "Step 2"): from the tasks that changed in one pass, with
 * what the handler kept about each, the actions of that pass. A ToolScript
 * rule like `pr-watcher.ts`: JSON in, an action list out, type imports only,
 * no I/O and time only from `input.now`. It gives the same outcome as
 * `task-effort/rules.ts` and `task-effort/decide.ts`, which a parity test
 * holds it to until the handler runs on it. It only ever sets `low` or
 * `high`, or takes its own effort off: never `medium`, `xhigh` or `max`,
 * and never on a task whose effort someone else set.
 */

/** The efforts the rule sets by itself. */
export type AutoEffort = "low" | "high";

/** What the handler keeps per task between events, as `EffortRecord`. */
export interface EffortMemory {
  readonly set: AutoEffort | null;
  readonly seen: string | null;
  readonly assigneeAgentId: string | null;
  readonly sentBack: boolean;
  readonly handsOff: boolean;
}

/** One task that was created or changed. */
export interface EffortTask {
  /** The task's identifier, such as `HAL-42`. */
  readonly task: string;
  /** The Paperclip event that changed it, so each action is carried out once. */
  readonly event: string;
  /** `assigneeAdapterOverrides.adapterConfig.effort`, or null for none. */
  readonly effort: string | null;
  readonly labels: readonly string[];
  readonly assigneeAgentId: string | null;
  /** What the handler kept before, or null for a task it never saw. */
  readonly before: EffortMemory | null;
  readonly created: boolean;
  /** A reviewer handed it back without an approval in this change. */
  readonly sentBackNow: boolean;
  /** It sits with a reviewer, whose run takes the reviewer's own effort. */
  readonly withReviewer: boolean;
}

/** The rule's settings, from the signal file or the defaults. */
export interface TaskEffortSettings {
  readonly highFrom: number;
  readonly highAfterSendBack: boolean;
}

/** One pass's input. */
export interface TaskEffortInput {
  readonly now: string;
  readonly settings: TaskEffortSettings;
  readonly tasks: readonly EffortTask[];
}

/** Set the task's effort, or take the rule's own effort off (null); keep `record` once written. */
export interface SetEffortAction {
  readonly kind: "set-effort";
  readonly key: string;
  readonly task: string;
  readonly effort: AutoEffort | null;
  readonly record: EffortMemory;
  /** The record to keep when the write is only logged or fails. */
  readonly recordUnwritten: EffortMemory;
}

/** Report an effort change the rule didn't make. */
export interface ForeignEffortAction {
  readonly kind: "report-foreign";
  readonly key: string;
  readonly task: string;
  readonly from: string | null;
  readonly to: string | null;
}

/** Keep what the rule saw, when it writes nothing. */
export interface RememberAction {
  readonly kind: "remember";
  readonly key: string;
  readonly task: string;
  readonly record: EffortMemory;
}

/** One thing a pass does. */
export type TaskEffortAction = SetEffortAction | ForeignEffortAction | RememberAction;

/** `opus-only` and the area tags that make a task opus-only by themselves, as `opusOnlyAreas`. */
const opusOnlyTags = [
  "opus-only",
  "security",
  "trust",
  "sandbox",
  "schema",
  "secrets",
  "sign-in",
  "oauth",
  "keychain",
];

/** The hardest `D1`–`D5` tag, or undefined without one. */
function difficultyOf(labels: readonly string[]): number | undefined {
  const levels = labels
    .map((label) => /^d([1-5])$/.exec(label)?.[1])
    .filter((level): level is string => level !== undefined)
    .map(Number);
  return levels.length === 0 ? undefined : Math.max(...levels);
}

/** The table: high for opus-only work, hard tasks and send-backs, low for the other code tasks. */
function wantedEffort(
  labelNames: readonly string[],
  sentBack: boolean,
  settings: TaskEffortSettings,
): AutoEffort | null {
  const labels = labelNames.map((name) => name.trim().toLowerCase());
  if (labels.some((label) => opusOnlyTags.includes(label))) {
    return "high";
  }
  const difficulty = difficultyOf(labels);
  if (difficulty === undefined) {
    return null;
  }
  const high = difficulty >= settings.highFrom || (sentBack && settings.highAfterSendBack);
  return high ? "high" : "low";
}

/** The change since the handler last looked; a first sight counts only for a task created with an effort. */
function foreignChange(task: EffortTask): { from: string | null; to: string | null } | undefined {
  const before = task.before;
  if (before === null) {
    return task.created && task.effort !== null ? { from: null, to: task.effort } : undefined;
  }
  return task.effort === before.seen ? undefined : { from: before.seen, to: task.effort };
}

function actionsOf(task: EffortTask, settings: TaskEffortSettings): TaskEffortAction[] {
  const { before } = task;
  const foreign = foreignChange(task);
  const ours = before !== null && before.set !== null && task.effort === before.set;
  const handsOff =
    (before?.handsOff ?? false) || foreign !== undefined || (task.effort !== null && !ours);
  const sentBack = (before?.sentBack ?? false) || task.sentBackNow;
  const unchanged: EffortMemory = {
    set: ours && !handsOff ? (before?.set ?? null) : null,
    seen: task.effort,
    assigneeAgentId: task.assigneeAgentId,
    sentBack,
    handsOff,
  };
  const wanted = task.withReviewer ? null : wantedEffort(task.labels, sentBack, settings);
  const writes = !(handsOff || task.assigneeAgentId === null || wanted === task.effort);
  const key = (what: string) => `${task.task}|${task.event}|${what}`;
  const report: TaskEffortAction[] =
    foreign === undefined
      ? []
      : [{ kind: "report-foreign", key: key("foreign"), task: task.task, ...foreign }];
  if (!writes) {
    return [
      ...report,
      { kind: "remember", key: key("remember"), task: task.task, record: unchanged },
    ];
  }
  const set: SetEffortAction = {
    kind: "set-effort",
    key: key("set-effort"),
    task: task.task,
    effort: wanted,
    record: { ...unchanged, set: wanted, seen: wanted },
    recordUnwritten: unchanged,
  };
  return [...report, set];
}

/**
 * Every action of one pass, per task in input order: a foreign change's
 * report first, then the effort to set or the record to keep.
 *
 * @example
 * decide({ now, settings: { highFrom: 4, highAfterSendBack: true }, tasks: [] }); // []
 */
export function decide(input: TaskEffortInput): TaskEffortAction[] {
  return input.tasks.flatMap((task) => actionsOf(task, input.settings));
}
