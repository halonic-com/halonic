/** The words of a saved run file's tab (HAL-17831); a team decision under HAL-2282. */
export const runFileWords = {
  /** The item kind's name. */
  kind: "Saved file",
  /** The line under the file's name: "Saved by Run 7k2m9p · read-only". */
  savedBy: (run: string) => `Saved by ${run} · read-only`,
  loading: (name: string) => `Loading ${name}`,
  loadFailed: (name: string) => `Couldn't load ${name}`,
  /** The run's log names the file, but its text isn't kept any more. */
  gone: "Halonic no longer has this file's text.",
  /** The run's log doesn't name a file by that name. */
  notInRun: "This run didn't save a file by that name.",
};
