// The limits on one step of a harness agent (requirement
// format.agent-harness-limits). A program such as Claude Code makes hundreds
// of model calls in a step, so the agent's `maxSteps`, sized for Halonic's
// own loop, can't bound it; these fields do, and only for a harness step.
import { s } from "@halonicjs/schema-kit";

/** The most model calls `harnessLimits.maxSteps` may allow. */
export const MAX_HARNESS_STEPS = 10_000;

/** The most minutes `harnessLimits.maxMinutes` may allow: one day. */
export const MAX_HARNESS_MINUTES = 1440;

/**
 * `harnessLimits`: what one step of the agent may use when it runs in a
 * harness program (`claude-code`, `codex`). Each field is optional; a limit
 * left out doesn't apply. Halonic's own loop ignores the block.
 */
export const HarnessLimits = s
  .object({
    /** Most model calls the program makes in one step. */
    maxSteps: s.number().int().min(1).max(MAX_HARNESS_STEPS).optional(),
    /** Most minutes one step runs, not counting the time it waits for a person's answer. */
    maxMinutes: s.number().int().min(1).max(MAX_HARNESS_MINUTES).optional(),
    /**
     * Most one step may spend, in the workspace budget's currency. Calls a
     * subscription pays for count as 0, so only time and steps bound those.
     */
    maxCost: s.number().positive().optional(),
  })
  .strict();
