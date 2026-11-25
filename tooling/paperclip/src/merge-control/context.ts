import type { Wait } from "./fill.ts";
import type { MergeSnapshot } from "./snapshot.ts";
import type { BoardSwitches, LogLine, MergeAction, MergeSettings, MergeState } from "./state.ts";

/**
 * One pass's working copy: the rule modules add actions and log lines and
 * change the state here, in order; `decide` returns the result.
 */

type Writable<T> = { -readonly [K in keyof T]: T[K] };
type WritableRecords<T> = {
  -readonly [K in keyof T]: T[K] extends Readonly<Record<string, infer V>>
    ? Record<string, V>
    : T[K];
};

/** The state while a pass works on it. */
export type WorkState = Writable<WritableRecords<Omit<MergeState, "board">>> & {
  board: Writable<BoardSwitches>;
};

/** What every rule module reads and writes. */
export interface PassContext {
  readonly snapshot: MergeSnapshot;
  readonly settings: MergeSettings;
  readonly now: Date;
  readonly state: WorkState;
  readonly actions: MergeAction[];
  readonly log: LogLine[];
  /** Queue entries whose merge group an action of this pass already cancels, counted once. */
  readonly cancelled: Set<number>;
  /** Why the fill left each candidate out this pass, for the not-queued note. */
  readonly waits: Map<number, Wait>;
}

/** A copy of the state the pass may change; the caller's stays as it was. */
export function workCopy(state: MergeState): WorkState {
  return structuredClone(state) as WorkState;
}

/** Minutes from `at` to now. */
export function minutesSince(context: PassContext, at: string): number {
  return (context.now.getTime() - Date.parse(at)) / 60_000;
}

/**
 * Adds a comment on a pull request unless the same kind was already posted
 * on this head (MERGER.md §4 "Comments": once per head).
 */
export function commentOnce(
  context: PassContext,
  kind: string,
  number: number,
  head: string,
  body: string,
): boolean {
  const key = `${kind}#${number}`;
  if (context.state.noted[key] === head) {
    return false;
  }
  context.state.noted[key] = head;
  context.actions.push({ kind: "comment", number, key: `${key}@${head}`, body });
  return true;
}

/** Adds one log line. */
export function logLine(context: PassContext, rule: string, text: string): void {
  context.log.push({ rule, text });
}
