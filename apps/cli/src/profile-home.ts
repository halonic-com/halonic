// A `HALONIC_HOME` that isn't a full path is the person's to fix,
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
 * // throws: HALONIC_HOME must be a full path, not "~/.halonic".
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

/**
 * The fix. On Windows it names the person's own home folder, also for a `~`:
 * the README says to set `HALONIC_HOME` as a user environment variable, and
 * Windows doesn't expand `$HOME` there, so `$HOME\.halonic` would be refused
 * again (HAL-15429).
 */
function fixFor(home: string, environment: ProfileEnvironment) {
  if (environment.platform === "windows") {
    return profileMessages.homeRelativeFix(`${environment.homeFolder}\\.halonic`);
  }
  return home.startsWith("~")
    ? profileMessages.homeTildeFix("$HOME/.halonic")
    : profileMessages.homeRelativeFix("$HOME/.halonic");
}
