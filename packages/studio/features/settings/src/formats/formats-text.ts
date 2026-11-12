import { saveFailed } from "../appearance/appearance-text.ts";

/**
 * The words of Settings → Formats: flow-settings 5 for the control, the pattern of the
 * Appearance failed save for its failure (team decision, HAL-1294).
 */
export const FORMAT = "Format";
export const FORMAT_HINT = "Used for numbers, dates and money everywhere in Halonic.";
export const FORMAT_NOT_SAVED = saveFailed("the format", (to) => `${FORMAT} is back to ${to}.`);
