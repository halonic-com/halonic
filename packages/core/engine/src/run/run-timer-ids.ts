// The timer ids of a run's timers in the local executor. Each starts with
// what the timer is for, and goes on with the call id, the state's timer key
// or the child run id it is about. A harness call's start limits have their
// own ids (`start-deadlines.ts`), and so does a run whose effects couldn't
// all be carried out (`resumeTimer` in `unfinished-effects.ts`).

/** A model call to carry out now. */
export const callTimer = "call:";

/** A run of the agent's harness to carry out now. */
export const harnessTimer = "harness:";

/** A timer a state set (`set-timer`), on the key the state gave it. */
export const stateTimer = "timer:";

/** A child run to hear from, on its parent's key. */
export const childTimer = "child:";

/** A connector call to make now. */
export const toolTimer = "tool:";
