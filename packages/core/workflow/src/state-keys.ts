import type { StateType, WorkflowState } from "@halonicjs/format";

/** A key of a workflow state, such as `agent` or `items`. */
export type StateKey = keyof WorkflowState;

/** The keys every state type uses: its type, its description and its transitions. */
export const COMMON_STATE_KEYS = ["type", "description", "on"] as const satisfies StateKey[];

/**
 * The keys each state type uses besides the common ones. The workflow file
 * has one shape for every type, so this is what tells them apart. The
 * engine's handler for a type sees only its type's keys (`StateOf`), so a
 * handler can't read a key this list doesn't give it, and validation warns
 * about every other key a state sets.
 */
export const STATE_KEYS = {
  task: [
    "agent",
    "input",
    "gets",
    "method",
    "with",
    "format",
    "conversation",
    "artifact",
    "output",
    "signal",
  ],
  wait: [],
  final: [],
  workflow: ["workflow", "input", "output", "signal"],
  parallel: ["branches", "join", "continueOnError", "gets", "output", "signal"],
  foreach: [
    "items",
    "as",
    "concurrency",
    "agent",
    "workflow",
    "method",
    "with",
    "input",
    "gets",
    "format",
    "output",
    "signal",
  ],
} as const satisfies { readonly [Type in StateType]: readonly StateKey[] };

/** A state of one type, with only the keys that type uses. */
export type StateOf<Type extends StateType> = Type extends StateType
  ? Pick<WorkflowState, (typeof COMMON_STATE_KEYS)[number] | (typeof STATE_KEYS)[Type][number]>
  : never;

/** Whether a state of this type uses the key. */
export function usesKey(type: StateType, key: StateKey): boolean {
  const keys: readonly StateKey[] = [...COMMON_STATE_KEYS, ...STATE_KEYS[type]];
  return keys.includes(key);
}

/** The state types that use the key, in the order of `STATE_KEYS`. */
export function typesUsing(key: StateKey): StateType[] {
  return (Object.keys(STATE_KEYS) as StateType[]).filter((type) => usesKey(type, key));
}
