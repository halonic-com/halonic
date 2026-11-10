/**
 * A command Halonic suggests, with the user's own `--dir` when they gave one
 * (cli-output section 3, "Which folder"), so it works where they typed it.
 *
 * @param command - the words after `halonic`, such as `validate`
 * @param dir - the `--dir` the user gave, if any
 * @param rest - the options after `--dir`, such as `--all`
 * @example
 * suggestedCommand("validate", "./acme", "--all"); // "halonic validate --dir ./acme --all"
 * suggestedCommand("test", undefined, "--list"); // "halonic test --list"
 */
export function suggestedCommand(command: string, dir: string | undefined, rest = ""): string {
  const words = ["halonic", command];
  if (dir !== undefined) {
    words.push("--dir", dir);
  }
  if (rest !== "") {
    words.push(rest);
  }
  return words.join(" ");
}
