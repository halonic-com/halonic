import { shellWord } from "../output/shell-word.ts";

/**
 * A command Halonic suggests, with the user's own `--dir` when they gave one
 * (cli-output section 3, "Which folder"), so it works where they typed it.
 * The folder is quoted when it holds a space, so the command can be copied
 * and run as it is.
 *
 * @param command - the words after `halonic`, such as `validate`
 * @param dir - the `--dir` the user gave, if any
 * @param rest - the options after `--dir`, such as `--all`
 * @example
 * suggestedCommand("validate", "./acme", "--all"); // "halonic validate --dir ./acme --all"
 * suggestedCommand("runs", "Acme sample"); // "halonic runs --dir \"Acme sample\""
 * suggestedCommand("test", undefined, "--list"); // "halonic test --list"
 */
export function suggestedCommand(command: string, dir: string | undefined, rest = ""): string {
  const words = ["halonic", command];
  if (dir !== undefined) {
    words.push("--dir", shellWord(dir));
  }
  if (rest !== "") {
    words.push(rest);
  }
  return words.join(" ");
}
