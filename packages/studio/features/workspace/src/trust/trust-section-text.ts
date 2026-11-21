/** The words of the workspace page's Trust section (states-flow-map 2.7, microcopy 4.5 and 6.1). */
export const TRUST_HEADING = "Trust";
/** The line when the workspace holds nothing to trust (HAL-10131, HAL-11795). */
export const NOTHING_TO_TRUST_LINE = "Nothing to trust here.";
/** Studio runs check trust since HAL-12409 (#3756), and Summarize since HAL-13134 (#4105). */
export const NOT_TRUSTED_LINE =
  "Not trusted yet. Halonic won't start programs or call real models from this workspace.";
/** The button of Settings › Trust that opens the workspace page at Trust. */
export const OPEN_TRUST = "Open Trust";
export const REVIEW = "Review";
export const REVIEW_CHANGES = "Review changes";
export const REMOVE_TRUST = "Remove trust";
export const REMOVING = "Removing…";
/** The Remove trust dialog's line: every start asks or refuses, and removing it closes the engine, so its runs stop (HAL-12409, HAL-13678). */
export const REMOVE_TRUST_BODY =
  "Halonic will ask again before running anything from this workspace, and runs in progress stop.";
export const CHANGED_BADGE = "Changed since you trusted it";
export const LOADING_LINE = "Loading workspace settings";
export const TRY_AGAIN = "Try again";
export const UNREADABLE_LINE = "Halonic couldn't read its list of trusted workspaces.";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "3 Nov" in the computer's own time zone, or "3 Nov 2026" with the year. */
export function trustDay(iso: string, withYear: boolean): string {
  const date = new Date(iso);
  const day = `${date.getDate()} ${months[date.getMonth()]}`;
  return withYear ? `${day} ${date.getFullYear()}` : day;
}

export function trustedOn(iso: string): string {
  return `Trusted on ${trustDay(iso, true)}`;
}
export function changedSince(iso: string): string {
  return `Changed since you trusted it on ${trustDay(iso, false)}.`;
}
export function removeTrustTitle(name: string): string {
  return `Remove trust from ${name}?`;
}
export function removedToast(name: string): string {
  return `Removed trust from ${name}`;
}
export function loadFailed(reason: string): string {
  return `Couldn't load workspace settings · ${reason}`;
}
export function removeFailed(name: string, reason: string): string {
  return `Couldn't remove trust from ${name}: ${reason}.`;
}
