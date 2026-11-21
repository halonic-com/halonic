import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * The fixes for a `HALONIC_HOME` that isn't an absolute folder (HAL-15274,
 * from C554, and HAL-15429, from C576, decided by Tomas on the tasks). The
 * reason is the profile package's own sentence: "HALONIC_HOME must be a full
 * path, not "~/.halonic"."
 */
export const profileMessages = defineMessages("profile", {
  /**
   * When it starts with `~`, as a quoted `export HALONIC_HOME="~/.halonic"`
   * leaves it: only an unquoted `~` is the home folder to the shell. Not on
   * Windows, where `HALONIC_HOME` is a user environment variable and no shell
   * turns `$HOME` into anything either.
   */
  homeTildeFix: () =>
    phrase`Inside quotes the shell doesn't turn ~ into your home folder. Use $HOME instead: HALONIC_HOME="$HOME/.halonic".`,
  /**
   * Any other relative folder, such as `profile`, and on Windows any value:
   * `example` is `$HOME/.halonic`, or on Windows `.halonic` in the person's
   * own home folder, joined with `\`.
   */
  homeRelativeFix: (example: string) =>
    phrase`Set HALONIC_HOME to a full path, such as ${example}.`,
});
