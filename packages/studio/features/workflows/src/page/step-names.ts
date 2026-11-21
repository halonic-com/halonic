import type { WorkflowStep } from "../api.ts";

/** What the card needs of a step to name it. */
export type NamedStep = Pick<WorkflowStep, "id" | "title">;

/**
 * Each step's name by its id, as its card on the canvas shows it: its title, or its id when it has
 * none. When two steps share a title, each also gets its id in brackets, "Reply (draft)", so a
 * picker never offers two that read the same.
 */
export function stepNames(steps: readonly NamedStep[]): ReadonlyMap<string, string> {
  const titleCount = new Map<string, number>();
  for (const step of steps) {
    if (step.title !== undefined) titleCount.set(step.title, (titleCount.get(step.title) ?? 0) + 1);
  }
  return new Map(
    steps.map((step) => {
      if (step.title === undefined) return [step.id, step.id];
      const shared = (titleCount.get(step.title) ?? 0) > 1;
      return [step.id, shared ? `${step.title} (${step.id})` : step.title];
    }),
  );
}

/** A step's name from {@link stepNames}; its id when it isn't there, as for a step the file lacks. */
export function nameOf(names: ReadonlyMap<string, string>, stepId: string): string {
  return names.get(stepId) ?? stepId;
}
