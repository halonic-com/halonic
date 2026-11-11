// Plain JavaScript on purpose: this file runs before any TypeScript, on whatever Node the user
// has, so it must parse on a Node that can't strip types. See `halonic.js`.

/** The oldest Node.js halonic runs on, the same as `devEngines.runtime` in the root package.json. */
export const nodeFloor = { major: 26, minor: 12 };

/**
 * The lines to print when `version` is older than {@link nodeFloor}, or none when it is new enough.
 *
 * @param {string} version - a Node.js version such as `process.versions.node`, "20.19.5"
 * @returns {string[]}
 */
export function nodeTooOldLines(version) {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  if (major > nodeFloor.major || (major === nodeFloor.major && minor >= nodeFloor.minor)) {
    return [];
  }
  const floor = `${nodeFloor.major}.${nodeFloor.minor}`;
  return [
    `✕ halonic needs Node.js ${floor} or newer. You have ${version}.`,
    `  Install Node.js ${floor} or newer from https://nodejs.org, then run halonic again.`,
  ];
}
