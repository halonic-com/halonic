import type { StepperCatalog } from "@halonicjs/action-steppers";

/**
 * The steppers this Halonic ships. None yet: definitions, step types and the
 * browser allow-list come with `core/action-catalog` (HAL-17518), which
 * replaces this. Until then only a `server-session` request validates, and
 * every other request is refused with its reason, as the stepper would
 * refuse it.
 */
export const installedStepperCatalog: StepperCatalog = {
  definition: () => undefined,
  stepType: () => undefined,
  browserOrigins: [],
  route: () => undefined,
};
