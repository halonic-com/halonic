/**
 * The thin-spec check's "Clarify acceptance criteria" decision as a signal
 * rule (HAL-18319, plan HAL-17450 rev 5, "Step 2"): from the tasks that
 * changed in one pass, with their thin-spec score and `Done when` text as
 * facts, the actions of that pass. A ToolScript rule like `pr-watcher.ts`:
 * JSON in, an action list out, type imports only, no I/O and time only from
 * `input.now`. It gives the same outcome as `plugin/thin-spec-check.ts` and
 * `thin-spec/done-when.ts`, which a parity test holds it to until the check
 * runs on it. The score itself comes from a model call, which only the
 * runtime makes: the rule asks for it with a `read` action. No action
 * carries the task's text; the executors write the existing wording.
 */

/** A task as the rule reads it. Its `Done when` text is only matched, never copied into an action. */
export interface SpecTask {
  readonly id: string;
  readonly identifier: string;
  readonly status: string;
  readonly assigneeAgentId: string | null;
  readonly createdByAgentId: string | null;
  readonly createdAt: string;
  readonly labels: readonly string[];
  /** Its title starts with "Clarify acceptance criteria:", so it is a clarify task itself. */
  readonly clarifyTask: boolean;
  /** The check already logged it: one check per task. */
  readonly checked: boolean;
  /** Its thin-spec score from the runtime's reading, or null before one. */
  readonly score: number | null;
  /** The rest of its `Done when` line, or the lines under a `Done when` heading; null without one. */
  readonly doneWhenText: string | null;
}

/** The rule's settings, from the signal file or the defaults. */
export interface ThinSpecSettings {
  /** A score above this flags the task. */
  readonly threshold: number;
  /** The hardest difficulty tag (`D1` to `D5`) it checks. */
  readonly upTo: number;
  /** How long after it was created a task still counts as new. */
  readonly newForHours: number;
  /** Whether a task without a checkable `Done when` line gets the comment and the clarify task. */
  readonly doneWhen: boolean;
}

/** One pass's input. */
export interface ThinSpecInput {
  readonly now: string;
  readonly settings: ThinSpecSettings;
  /** The board's clarifier (a PM agent), for a task no other agent asked for. */
  readonly clarifierAgentId: string | null;
  readonly tasks: readonly SpecTask[];
}

/** Read the task's text once and score it; the next pass decides with the score. */
export interface ReadAction {
  readonly kind: "read";
  readonly task: string;
}

/** Log the check on the task and in the day's log; written first, so the clarify step never starts a second check. */
export interface RecordAction {
  readonly kind: "record";
  readonly task: string;
  readonly identifier: string;
  readonly checkedAt: string;
  readonly flagged: boolean;
  readonly score: number;
  readonly doneWhenMissing: boolean;
}

/** Comment on the task that it has no checkable `Done when` line, with the spec template's link. */
export interface CommentDoneWhenAction {
  readonly kind: "comment-done-when";
  readonly task: string;
}

/** Why a task gets a clarify task: its score when it flagged it, and a missing `Done when` line. */
export interface ClarifyReasons {
  readonly score?: number;
  readonly doneWhenMissing: boolean;
}

/** Add a "Clarify acceptance criteria" task for the clarifier and block the task on it, unless its writer has started. */
export interface ClarifyAction {
  readonly kind: "clarify";
  readonly task: string;
  readonly identifier: string;
  readonly assigneeAgentId: string;
  readonly reasons: ClarifyReasons;
}

/** Report that a task needs clarifying and nobody can: no other agent asked for it and no clarifier is set. */
export interface NoClarifierAction {
  readonly kind: "no-clarifier";
  readonly task: string;
}

/** One thing a pass does. */
export type ThinSpecAction =
  | ReadAction
  | RecordAction
  | CommentDoneWhenAction
  | ClarifyAction
  | NoClarifierAction;

/** The writer hasn't started yet. */
const waitingStatuses = new Set(["backlog", "todo"]);

/** A test file: a path such as `export.test.ts` or `flow.spec.tsx`. */
const testPath = /[\w./-]+\.(?:test|spec)\.[a-z]+\b/i;

/** The word test next to the test's name in quotes or backticks: `test "exports twice"`, `the "exports twice" test`. */
const namedTest = /\btests?\s+["'`“‘][^"'`”’\n]+|["'`”’]\s*tests?\b/i;

/** A command in backticks, such as `pnpm test`. */
const backtickedCommand = /`[^`\n]+`/;

/** A result someone can see: the user sees, the screen shows, the CLI prints or exits. */
const visibleResult = /\b(?:sees?|shows?|prints?|exits?)\b/i;

/** Whether the task lacks a checkable `Done when` line, as `doneWhenMissing`. */
function doneWhenMissing(text: string | null): boolean {
  return (
    text === null ||
    ![testPath, namedTest, backtickedCommand, visibleResult].some((rule) => rule.test(text))
  );
}

/** Whether this is a code task an agent was just given, hasn't started and wasn't checked yet. */
function isNewCodingTask(task: SpecTask, input: ThinSpecInput): boolean {
  const { upTo, newForHours } = input.settings;
  const levels = task.labels
    .map((label) => /^d([1-5])$/.exec(label.trim().toLowerCase())?.[1])
    .filter((level): level is string => level !== undefined)
    .map(Number);
  const age = Date.parse(input.now) - Date.parse(task.createdAt);
  return (
    task.assigneeAgentId !== null &&
    waitingStatuses.has(task.status) &&
    levels.some((level) => level <= upTo) &&
    !task.clarifyTask &&
    !task.checked &&
    age <= newForHours * 60 * 60 * 1000
  );
}

/** Who clarifies: the agent that asked for the task, or the board's clarifier. */
function clarifierFor(task: SpecTask, input: ThinSpecInput): string | null {
  const requester = task.createdByAgentId;
  if (requester !== null && requester !== task.assigneeAgentId) {
    return requester;
  }
  return input.clarifierAgentId;
}

function actionsOf(task: SpecTask, input: ThinSpecInput): ThinSpecAction[] {
  if (!isNewCodingTask(task, input)) {
    return [];
  }
  if (task.score === null) {
    return [{ kind: "read", task: task.id }];
  }
  const flagged = task.score > input.settings.threshold;
  const missing = input.settings.doneWhen && doneWhenMissing(task.doneWhenText);
  const actions: ThinSpecAction[] = [
    {
      kind: "record",
      task: task.id,
      identifier: task.identifier,
      checkedAt: input.now,
      flagged,
      score: task.score,
      doneWhenMissing: missing,
    },
  ];
  if (missing) {
    actions.push({ kind: "comment-done-when", task: task.id });
  }
  if (!flagged && !missing) {
    return actions;
  }
  const assigneeAgentId = clarifierFor(task, input);
  if (assigneeAgentId === null) {
    return [...actions, { kind: "no-clarifier", task: task.id }];
  }
  const reasons = { ...(flagged ? { score: task.score } : {}), doneWhenMissing: missing };
  return [
    ...actions,
    { kind: "clarify", task: task.id, identifier: task.identifier, assigneeAgentId, reasons },
  ];
}

/**
 * Every action of one pass, per task in input order: a `read` for a new task
 * without a score; for a scored one its record, then the `Done when` comment
 * and the clarify step when they apply.
 *
 * @example
 * decide({ now, settings: { threshold: 0.5, upTo: 4, newForHours: 24, doneWhen: true }, clarifierAgentId: null, tasks: [] }); // []
 */
export function decide(input: ThinSpecInput): ThinSpecAction[] {
  return input.tasks.flatMap((task) => actionsOf(task, input));
}
