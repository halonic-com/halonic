// The rules a workspace signal can switch on (plan HAL-17450 rev 5, "Step 2"
// and "Safety"). A rule is reviewed code in the plugin runtime that ships
// with Halonic: a pure function from a snapshot of facts to a list of
// actions, carried out only by the runtime's own executors. A signal file
// only picks one rule and sets its settings. This list is the whole set: a
// workspace can't add to it, so a signal can never give itself a power the
// runtime doesn't already have. Adding a rule is a security PR (Julian and
// Liam).
import { s } from "@halonicjs/schema-kit";

/**
 * Why the PR watcher wakes a task's holder, one per state of a pull request:
 * a red `ci-ok` on its head, a conflict while it isn't in the merge queue, a
 * base changed after its last push, a new review on its head, an approving
 * GitHub review where the base branch needs one, a comment on the task after
 * the merge, and a head merge control holds after its merge group failed.
 */
export const PR_WATCHER_WAKES = [
  "ci-red",
  "conflict",
  "retargeted",
  "review",
  "approved",
  "merged",
  "held",
] as const;

/** What one rule is, for the people who write and review signal files. */
export interface SignalRuleInfo {
  /** One line on what the rule does. */
  readonly about: string;
  /** Whether its actions change anything; a new or changed writing signal runs one dry pass first. */
  readonly writes: boolean;
}

/**
 * Every rule, with the settings a signal file gives it under `rule.with`.
 * Settings are workspace data (which states, how long), never a key. Each
 * settings map refuses keys it doesn't know, and every setting has a
 * default that keeps today's behaviour.
 */
export const SIGNAL_RULES = {
  "pr-watcher": {
    about:
      "Marks a task done once its pull requests merged and landed green, and wakes its holder once per new state of an open one.",
    writes: true,
    settings: s
      .object({
        /** Whether the rule marks tasks done. */
        done: s.boolean().default(true),
        /** The states that wake the task's holder. */
        wakeOn: s
          .array(s.enum(PR_WATCHER_WAKES))
          .max(PR_WATCHER_WAKES.length)
          .default([...PR_WATCHER_WAKES]),
      })
      .strict()
      .prefault({}),
  },
  "board-ask": {
    about:
      "Wakes the Board Checker once for agents' comments that ask the board, and lists them in its board-asks document.",
    writes: true,
    settings: s
      .object({
        /** How far back, in minutes, a comment counts as a new ask. */
        windowMinutes: s.number().int().min(1).max(60).default(12),
        /** Whether a new ask wakes the Board Checker; the list is kept either way. */
        wake: s.boolean().default(true),
      })
      .strict()
      .prefault({}),
  },
  "task-effort": {
    about:
      "Sets a task's thinking effort from its tags: high or low, never medium or max, and never on a task whose effort someone else set.",
    writes: true,
    settings: s
      .object({
        /** The easiest difficulty tag (`D1` to `D5`) that runs at high. */
        highFrom: s.number().int().min(1).max(5).default(4),
        /** Whether a rerun after a reviewer's send-back runs at high. */
        highAfterSendBack: s.boolean().default(true),
      })
      .strict()
      .prefault({}),
  },
} as const;

/** A rule's name, such as `pr-watcher`. */
export type SignalRuleName = keyof typeof SIGNAL_RULES;

/** Every rule's name, in the order of the list. */
export function signalRuleNames(): SignalRuleName[] {
  return Object.keys(SIGNAL_RULES) as SignalRuleName[];
}

/**
 * What a rule does and whether it writes.
 *
 * @param name - the rule's name from a signal file
 * @returns its description, without its settings schema
 *
 * @example
 * signalRuleInfo("pr-watcher").writes; // true
 */
export function signalRuleInfo(name: SignalRuleName): SignalRuleInfo {
  const { about, writes } = SIGNAL_RULES[name];
  return { about, writes };
}
