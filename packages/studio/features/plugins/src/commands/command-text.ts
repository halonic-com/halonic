// The words of a plugin command's dialog, from the plugin screens design
// section 8.1, microcopy 24 T14 and the UX acceptance checklist 7 and G5
// (HAL-1739, HAL-1952, HAL-1959). Every button word is Halonic's: a command
// called "Delete everything" still runs with Run command. The plugin's text
// is only ever a value in these lines.

export const RUN_COMMAND = "Run command";
/** The busy label while the tool runs: microcopy 9.5's "Running…". */
export const RUNNING = "Running…";
export const RUN_AGAIN = "Run again";
export const TRY_AGAIN = "Try again";
export const CANCEL = "Cancel";
export const CLOSE = "Close";
export const RESULT = "Result";
/** The Copy button's name for screen readers. */
export const COPY_RESULT = "Copy the result";

/** The first half of the line under the title: "From the Weather plugin". */
export function fromPlugin(name: string): string {
  return `From the ${name} plugin`;
}

/** The second half, around the tool's name in code: "· uses the tool `forecast`, which reads". */
export const USES_THE_TOOL = " · uses the tool ";
export const WHICH_READS = ", which reads";

/** A required field left empty. The settings section shows the same line. */
export const FILL_THIS_IN = "Fill this in: it is required.";

/** The reason when a tool doesn't answer in time: "the plugin didn't answer in 30 seconds". */
export function noAnswerReason(ms: number): string {
  return `the plugin didn't answer in ${Math.round(ms / 1000)} seconds`;
}

/** Where a plugin's command comes from, beside its title in Ctrl K: "Weather plugin". */
export function commandSource(name: string): string {
  return `${name} plugin`;
}

/**
 * The command failed: "Couldn't run Show forecast: the service didn't answer." (G5, microcopy
 * 1.1). A reason that ends in a full stop doesn't get a second one.
 */
export function commandFailedLine(title: string, reason: string): string {
  return `Couldn't run ${title}: ${reason.replace(/[.!?]+$/u, "")}.`;
}
