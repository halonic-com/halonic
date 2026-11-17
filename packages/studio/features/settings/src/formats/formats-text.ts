import { saveFailed } from "../save-failed.ts";

/**
 * The words of Settings → Formats: flow-settings 5 for the control, the pattern of the
 * Appearance failed save for its failure (team decision, HAL-1294).
 */
export const FORMAT = "Format";
/** The label in front of the sample line, so it reads as a sample of numbers and dates. */
export const FORMAT_EXAMPLE = "Example:";
export const FORMAT_NOT_SAVED = saveFailed("the format", (to) => `${FORMAT} is back to ${to}.`);
