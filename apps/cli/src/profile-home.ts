// A `HALONIC_HOME` that isn't an absolute folder is the person's to fix,
// most often a quoted `export HALONIC_HOME="~/.halonic"`, which the shell
// leaves as it is. The profile package refuses it with a `RangeError`, a
// bug to `printError`; here it becomes an `invalid_input` error with that
// sentence and a fix (HAL-15274, `cli.profile-home`).

import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { KindedError } from "@halonicjs/std";
import { plainText } from "./messages/phrase.ts";
import { profileMessages } from "./messages/profile.ts";

/**
 * The environment as it is, once its `HALONIC_HOME`, when set, names an
 * absolute folder.
 *
 * @param environment - the system, home folder and environment variables
 * @returns the same environment
 * @throws KindedError `invalid_input` when `HALONIC_HOME` isn't an absolute
 *   folder, with the profile package's error as its cause
 *
 * @example
 * checkProfileHome({ platform: "linux", homeFolder: "/srv/acme", variables: { HALONIC_HOME: "~/.halonic" } });
 * // throws: HALONIC_HOME must be an absolute folder, not "~/.halonic".
 */
export function checkProfileHome(environment: ProfileEnvironment): ProfileEnvironment {
  const home = environment.variables["HALONIC_HOME"];
  if (home === undefined || home === "") {
    return environment;
  }
  try {
    profileFolder(environment);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    throw new KindedError("invalid_input", error.message, {
      fix: plainText(fixFor(home, environment).phrase),
      cause: error,
    });
  }
  return environment;
}

/** The fix, with `$HOME/.halonic` joined the system's way. */
function fixFor(home: string, environment: ProfileEnvironment) {
  const example = environment.platform === "windows" ? "$HOME\\.halonic" : "$HOME/.halonic";
  return home.startsWith("~")
    ? profileMessages.homeTildeFix(example)
    : profileMessages.homeRelativeFix(example);
}
