import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * The fixes for a `HALONIC_HOME` that isn't a full path (HAL-15274, from
 * C554; reworded in HAL-15429, from C576). The reason is the profile
 * package's own sentence: "HALONIC_HOME must be a full path, not
 * "~/.halonic"."
 */
export const profileMessages = defineMessages("profile", {
  /**
   * When it starts with `~`, as a quoted `export HALONIC_HOME="~/.halonic"`
   * leaves it: only an unquoted `~` is the home folder to the shell.
   */
  homeTildeFix: (example: string) =>
    phrase`Inside quotes the shell doesn't turn ~ into your home folder. Use $HOME instead: HALONIC_HOME="${example}".`,
  /**
   * Any other relative folder, such as `profile`, and on Windows every one:
   * there the example is the real home folder, because a user environment
   * variable doesn't expand `$HOME`.
   */
  homeRelativeFix: (example: string) =>
    phrase`Set HALONIC_HOME to a full path, such as ${example}.`,
});
