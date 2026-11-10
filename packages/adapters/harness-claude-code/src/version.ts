/** A program's version as three numbers, such as 2.1.321. */
export interface ProgramVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Three dot-separated numbers at the start of a line, such as "2.1.321" in "2.1.321 (Claude Code)". */
const leadingVersion = /^(\d+)\.(\d+)\.(\d+)(?![\d.])/;

/**
 * Reads the version a program prints at the start of its output. Anything
 * after the three numbers, such as " (Claude Code)", is ignored; output that
 * doesn't start with them gives `undefined`.
 *
 * @example
 * readLeadingVersion("2.1.321 (Claude Code)\n"); // { major: 2, minor: 1, patch: 321 }
 * readLeadingVersion("claude: command not found"); // undefined
 */
export function readLeadingVersion(output: string): ProgramVersion | undefined {
  const match = leadingVersion.exec(output.trim());
  if (match === null) return undefined;
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/** The version written the usual way, such as "2.1.321". */
export function formatVersion(version: ProgramVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Whether `version` is `minimum` or newer, comparing the major, minor and
 * patch numbers in turn.
 *
 * @example
 * isAtLeast({ major: 2, minor: 1, patch: 321 }, { major: 2, minor: 1, patch: 311 }); // true
 */
export function isAtLeast(version: ProgramVersion, minimum: ProgramVersion): boolean {
  if (version.major !== minimum.major) return version.major > minimum.major;
  if (version.minor !== minimum.minor) return version.minor > minimum.minor;
  return version.patch >= minimum.patch;
}
