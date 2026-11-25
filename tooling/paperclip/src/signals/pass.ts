import type { SignalPlan } from "./load.ts";
import type { DoneAction, PrWatcherAction, WakeAction } from "./rules/pr-watcher.ts";

/**
 * Carries out one signal rule's actions (HAL-17980) through the plugin
 * runtime's executors, and through nothing else: the rule only returns
 * data. Each action is carried out once per key (task, pull request, head
 * and what). A writing signal from a file that is new or changed since the
 * last pass, or that asks for it, runs as a dry run: it logs what it would
 * do and writes nothing. The built-in defaults are today's behaviour and
 * need no dry pass.
 */

/** The executors a signal's actions go through; each returns its log line. */
export interface SignalExecutors {
  /** Wakes the task's holder once with every new state of this pass. */
  readonly wake: (task: string, actions: readonly WakeAction[]) => Promise<string>;
  /** Changes the task, such as marking it done. */
  readonly "task-update": (action: DoneAction) => Promise<string>;
}

/** What the pass keeps between passes. */
export interface SignalState {
  readonly version: 1;
  /** The fingerprint of each rule's signal at its last pass. */
  readonly applied: Readonly<Record<string, string>>;
  /** The action keys carried out, with when, for the tasks still watched. */
  readonly done: Readonly<Record<string, string>>;
}

/** A state before the first pass. */
export const emptySignalState: SignalState = { version: 1, applied: {}, done: {} };

/** What one pass needs. */
export interface SignalPassInput {
  readonly plan: SignalPlan;
  readonly actions: readonly PrWatcherAction[];
  /** The tasks the rule read this pass; keys of other tasks are forgotten. */
  readonly tasks: readonly string[];
  readonly state: SignalState;
  readonly executors: SignalExecutors;
  readonly now: string;
}

/** What one pass did: its log lines, whether it was a dry run, and the state to keep. */
export interface SignalPassResult {
  readonly lines: readonly string[];
  readonly dryRun: boolean;
  readonly state: SignalState;
}

/** Whether this pass only logs. */
export function isDryRun(plan: SignalPlan, state: SignalState): boolean {
  if (!plan.writes) {
    return false;
  }
  return plan.dryRun || (plan.source === "file" && state.applied[plan.rule] !== plan.fingerprint);
}

function dryLine(rule: string, action: PrWatcherAction): string {
  const what =
    action.kind === "wake"
      ? `wake ${action.task} for ${action.reason} on ${action.pr}`
      : `mark ${action.task} ${action.status}`;
  return `Signal ${rule} (dry run): would ${what} (${action.key}).`;
}

/**
 * Executors that only log what they would do, one line per action, and
 * write nothing: for a pass that runs beside today's watcher, which still
 * does the writes (HAL-18197).
 */
export function dryRunSignalExecutors(rule: string): SignalExecutors {
  return {
    wake: async (_task, actions) => actions.map((action) => dryLine(rule, action)).join("\n"),
    "task-update": async (action) => dryLine(rule, action),
  };
}

/** Every stored key starts with its task: keeps the keys of the tasks still watched. */
function keep(
  done: Readonly<Record<string, string>>,
  tasks: ReadonlySet<string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(done).filter(([key]) => tasks.has(key.split("|")[0] ?? "")),
  );
}

/** An action's stored key: the task, then the rule's key. */
function storedKey(action: PrWatcherAction): string {
  return action.kind === "wake" ? `${action.task}|${action.key}` : action.key;
}

/**
 * Carries out each write on its own, as `workflow-host/lifecycle-pass.ts`
 * does: a key is recorded as soon as its write succeeded, and a write that
 * throws is logged and left for the next pass, so the writes before it are
 * never sent twice and the ones after it still run.
 */
async function carryOut(input: SignalPassInput, fresh: readonly PrWatcherAction[]) {
  const lines: string[] = [];
  const done: Record<string, string> = {};
  const wakes = new Map<string, WakeAction[]>();
  const attempt = async (
    what: string,
    actions: readonly PrWatcherAction[],
    write: () => Promise<string>,
  ) => {
    try {
      lines.push(await write());
      for (const action of actions) {
        done[storedKey(action)] = input.now;
      }
    } catch (error) {
      lines.push(
        `Signal ${input.plan.rule}: ${what} failed, tried again next pass: ${(error as Error).message}`,
      );
    }
  };
  for (const action of fresh) {
    if (action.kind === "wake") {
      wakes.set(action.task, [...(wakes.get(action.task) ?? []), action]);
    } else {
      await attempt(`marking ${action.task} ${action.status}`, [action], () =>
        input.executors["task-update"](action),
      );
    }
  }
  for (const [task, actions] of wakes) {
    await attempt(`waking ${task}`, actions, () => input.executors.wake(task, actions));
  }
  return { lines, done };
}

/**
 * Runs one pass of one rule's actions.
 *
 * @example
 * await signalPass({ plan, actions: [], tasks: [], state: emptySignalState, executors, now });
 */
export async function signalPass(input: SignalPassInput): Promise<SignalPassResult> {
  const { plan, state } = input;
  const dryRun = isDryRun(plan, state);
  const fresh = input.actions.filter((action) => state.done[storedKey(action)] === undefined);
  const applied = { ...state.applied, [plan.rule]: plan.fingerprint };
  const tasks = new Set(input.tasks);
  if (dryRun) {
    return {
      lines: fresh.map((action) => dryLine(plan.rule, action)),
      dryRun,
      state: { version: 1, applied, done: keep(state.done, tasks) },
    };
  }
  const { lines, done } = await carryOut(input, fresh);
  return {
    lines,
    dryRun,
    state: { version: 1, applied, done: keep({ ...state.done, ...done }, tasks) },
  };
}
