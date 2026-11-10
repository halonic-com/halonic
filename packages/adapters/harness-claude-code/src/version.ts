import { readVersion, type Version } from "@halonicjs/std";

/** Three dot-separated numbers at the start of a line, such as "2.1.321" in "2.1.321 (Claude Code)". */
const leadingVersion = /^\d+\.\d+\.\d+(?![\d.])/;

/**
 * Reads the version a program prints at the start of its output. Anything
 * after the three numbers, such as " (Claude Code)", is ignored; output that
 * doesn't start with them gives `undefined`. Reading and comparing the
 * version itself is std's part, so both harness adapters share one order.
 *
 * @example
 * readLeadingVersion("2.1.321 (Claude Code)\n"); // { major: 2, minor: 1, patch: 321, prerelease: [] }
 * readLeadingVersion("claude: command not found"); // undefined
 */
export function readLeadingVersion(output: string): Version | undefined {
  const match = leadingVersion.exec(output.trim());
  if (match === null) return undefined;
  return readVersion(match[0]);
}
