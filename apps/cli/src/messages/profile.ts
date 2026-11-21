import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * The fixes for a `HALONIC_HOME` that isn't an absolute folder (HAL-15274,
 * from C554, decided by Tomas on the task). The reason is the profile
 * package's own sentence: "HALONIC_HOME must be an absolute folder, not
 * "~/.halonic"."
 */
export const profileMessages = defineMessages("profile", {
  /**
   * When it starts with `~`, as a quoted `export HALONIC_HOME="~/.halonic"`
   * leaves it: only an unquoted `~` is the home folder to the shell.
   */
  homeTildeFix: (example: string) =>
    phrase`Use $HOME instead of ~, which the shell leaves as it is inside quotes: HALONIC_HOME="${example}".`,
  /** Any other relative folder, such as `profile`. */
  homeRelativeFix: (example: string) =>
    phrase`Set HALONIC_HOME to a full path, such as ${example}.`,
});
