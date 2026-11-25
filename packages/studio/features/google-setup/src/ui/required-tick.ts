import {
  type ConsentStep,
  personalAppOf,
  type RequiredTick,
  type SetupRecord,
  type SetupStep,
} from "@halonicjs/google-setup";

/** Whether the record has the tick: the test user listed (in *Testing*), or "In production". */
export function isTicked(record: SetupRecord, tick: RequiredTick): boolean {
  switch (tick) {
    case "test-user":
      return (personalAppOf(record)?.testUserTickedAt ?? null) !== null;
    case "in-production":
      return record.inProductionTickedAt !== null;
  }
}

/** Whether the step needs a tick the record doesn't have yet, so **Done, next** waits. */
export function needsTick(step: SetupStep, record: SetupRecord): boolean {
  return step.requiredTicks.some((tick) => !isTicked(record, tick));
}

/** Step 3 among the generated steps, which says how the app is published and which tick it needs. */
export function consentStepOf(steps: readonly SetupStep[]): ConsentStep | undefined {
  return steps.find((step): step is ConsentStep => step.id === "consent");
}

/** How the personal app is published, from step 3; `null` for a Workspace account. */
export function publishingOf(steps: readonly SetupStep[]): ConsentStep["publishing"] {
  return consentStepOf(steps)?.publishing ?? null;
}
