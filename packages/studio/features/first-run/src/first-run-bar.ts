import { type FirstRunState, type FirstRunStep, firstRunSteps } from "./first-run-state.ts";

/** How the bar marks a step: ticked, the current ring-and-dot, a red cross, or still to come. */
export type BarMark = "done" | "current" | "failed" | "todo";

/** One step of the bar's strip. */
export interface BarStep {
  readonly step: FirstRunStep;
  /** 1 to 4, as the strip numbers it. */
  readonly number: number;
  readonly mark: BarMark;
}

/** The ways out the bar may show at its right; each shows once, and only here (first-run-flow 5). */
export type BarWayOut = "skip";

/**
 * The strip `1 Demo · 2 Model · 3 Run · 4 Approve` for a first run that is on
 * (`first-run.bar`): the steps before the current one ticked, the current one the ring-and-dot,
 * or a red cross on a failed run, and the rest still to come. While the run waits for you,
 * Approve is the current step.
 */
export function barSteps(state: Extract<FirstRunState, { kind: "on" }>): readonly BarStep[] {
  const current = firstRunSteps.indexOf(state.step);
  return firstRunSteps.map((step, index) => ({
    step,
    number: index + 1,
    mark: markOf(index, current, state.failed === true),
  }));
}

function markOf(index: number, current: number, failed: boolean): BarMark {
  if (index < current) return "done";
  if (index > current) return "todo";
  return failed ? "failed" : "current";
}

/**
 * The way out at the bar's right for the step the first run is at: **Skip, I'll explore** on the
 * demo screen. The model screen's **Set up later** comes with that screen, **Something wrong?**
 * with the Check this computer dialog (HAL-13411), and **Cancel run** with the run's own build;
 * until then those steps show none.
 */
export function barWayOut(state: Extract<FirstRunState, { kind: "on" }>): BarWayOut | undefined {
  return state.step === "demo" ? "skip" : undefined;
}
