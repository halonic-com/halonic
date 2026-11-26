/**
 * The words of the title bar's Update button, its Update available dialog and the Updated to
 * dialog after a restart (HAL-19364, the board's request on HAL-10). The state lines come from
 * About Halonic (`about-text.ts`) and the dialog's title from the restart flow (`restart-text.ts`),
 * so every place says the same thing.
 */
export const UPDATE = "Update";
export const UPDATE_AVAILABLE = "Update available";
export const INSTALL = "Install";
export const RESTART = "Restart";
export const RESTARTING = "Restarting…";
export const DOWNLOADING = "Downloading…";
export const NOT_NOW = "Not now";
export const CLOSE = "Close";
export const WHAT_CHANGED = "What changed";
export const RELEASE_NOTES = "Release notes";
/** When the update's manifest had no notes: the release page says what changed. */
export const NO_NOTES = "The release notes say what changed.";

/** The button's accessible name; its visible word is only "Update". */
export const buttonName = (version: string) => `${UPDATE_AVAILABLE}: Halonic ${version}`;
export const updatedFrom = (from: string) => `You were on Halonic ${from}.`;
