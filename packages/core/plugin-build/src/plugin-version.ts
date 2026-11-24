// A plugin's version is strict `x.y.z`: no `v`, no pre-release or build part
// and no leading zeros. It becomes part of two file names, so the pattern is
// the only gate between `--version` and a path.

import { err, ok, type Result } from "@halonicjs/std";

// A number without leading zeros, at most 9 digits, so raising the minor
// number stays a safe integer.
const part = "(0|[1-9][0-9]{0,8})";

/** A strict `x.y.z` version, such as `0.3.0`. */
export const pluginVersionPattern = new RegExp(`^${part}\\.${part}\\.${part}$`);

/** The version a build gets when there is neither `--version` nor a previous build. */
export const firstPluginVersion = "0.1.0";

/** Why a version was refused. */
export interface PluginVersionProblem {
  readonly code: "bad-version";
  /** The text that isn't a strict `x.y.z` version. */
  readonly version: string;
}

/**
 * Whether a text is a strict `x.y.z` version.
 *
 * @example
 * isPluginVersion("0.3.0"); // true
 * isPluginVersion("v0.3.0"); // false
 * isPluginVersion("0.3.0-beta.1"); // false
 */
export function isPluginVersion(text: string): boolean {
  return pluginVersionPattern.test(text);
}

/** What the version of a new build is chosen from. */
export interface VersionChoice {
  /** The version the user asked for (`--version`), if any. */
  readonly requested?: string;
  /** The version of the previous build (`--since`), if any. */
  readonly previous?: string;
}

/**
 * Chooses a new build's version: the requested one when given, otherwise the
 * previous version with its minor number raised and its patch number reset,
 * otherwise {@link firstPluginVersion}. So CI can build on every merge
 * without anyone bumping a number, and the same inputs give the same version.
 *
 * @returns the version, or the problem when a given version isn't strict `x.y.z`
 *
 * @example
 * nextPluginVersion({ requested: "2.0.0", previous: "0.3.4" }); // ok("2.0.0")
 * nextPluginVersion({ previous: "0.3.4" }); // ok("0.4.0")
 * nextPluginVersion({}); // ok("0.1.0")
 */
export function nextPluginVersion(choice: VersionChoice): Result<string, PluginVersionProblem> {
  if (choice.requested !== undefined) {
    return checked(choice.requested);
  }
  if (choice.previous === undefined) {
    return ok(firstPluginVersion);
  }
  const match = pluginVersionPattern.exec(choice.previous);
  if (match === null) {
    return err({ code: "bad-version", version: choice.previous });
  }
  const [, major, minor] = match;
  // A minor number of nine 9s would grow to ten digits: refused by the pattern.
  return checked(`${major}.${Number(minor) + 1}.0`);
}

function checked(version: string): Result<string, PluginVersionProblem> {
  if (!isPluginVersion(version)) {
    return err({ code: "bad-version", version });
  }
  return ok(version);
}
