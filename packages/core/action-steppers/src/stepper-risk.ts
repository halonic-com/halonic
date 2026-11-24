/**
 * How risky a stepper is. `admin` and `irreversible` steps are confirmed in
 * the shell's native dialog; by default only requesters the user allowed may
 * ask for them (architecture note on HAL-17491, 6.5).
 */
export type StepperRisk = "routine" | "admin" | "irreversible";

/** The risk levels from lowest to highest, so a request's risk is the highest of its blocks. */
export const stepperRisks: readonly StepperRisk[] = ["routine", "admin", "irreversible"];
