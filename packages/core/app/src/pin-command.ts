// The program a pinned package runner starts, as `app.package-runner-launch`
// checks it: with a package option such as `npx -p`, the runner's command
// word is a program, which must be the pin's own.

import type { ConnectorPin } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { isSamePackage } from "./connector-pin.ts";

/**
 * Runner options whose value names a package to fetch: `npx -p`, `npm exec
 * --package`, `uvx --from` and `--with`, `pipx run --spec`. `--with` may
 * list several, split by commas.
 */
export const packageOptions = new Set(["-p", "--package", "--from", "--with", "--spec"]);

/**
 * Package options after which the runner starts its command word as a
 * program, found among the fetched packages or on `PATH`; `pipx run --spec`
 * finds it in a venv that also holds `python`. With one of them, a pinned
 * runner may only start the pin's own program.
 */
const commandOptions = new Set(["-p", "--package", "--from", "--with", "--spec"]);

/**
 * With a package option such as `npx -p <pin> sh`, the runner starts its
 * command word as a program, which needn't come from the pin. That word
 * must be the pin's package name, with or without its npm scope.
 * `subcommands` are the runner's own, such as `exec` for `npm exec`.
 */
export function checkCommandWord(
  pin: ConnectorPin,
  subcommands: readonly (readonly string[])[],
  words: readonly string[],
): Result<ConnectorPin, string> {
  const option = words
    .map((word) => word.split("=", 1)[0] ?? "")
    .find((name) => commandOptions.has(name));
  if (option === undefined) {
    return ok(pin);
  }
  const allowed = [...new Set([pin.package, pin.package.replace(/^@[^/]+\//, "")])];
  const command = commandWord(subcommands, words);
  if (command === undefined) {
    return err(`the command fetches the pin with ${option} but names no program to run`);
  }
  if (allowed.some((name) => isSamePackage(pin.registry, command, name))) {
    return ok(pin);
  }
  const names = allowed.map((name) => `"${name}"`).join(" or ");
  return err(
    `the command fetches the pin with ${option} but runs "${command}", and a pinned runner may only run ${names}`,
  );
}

/**
 * The program a runner starts: the first word after its subcommand that
 * isn't an option or a package option's value. An option that takes a
 * value of its own, such as `--python 3.12`, makes its value look like the
 * command word, which errs to the safe side.
 */
function commandWord(
  subcommands: readonly (readonly string[])[],
  words: readonly string[],
): string | undefined {
  const start = subcommandEnd(subcommands, words);
  return words.find(
    (word, index) =>
      index >= start && !word.startsWith("-") && !packageOptions.has(words[index - 1] ?? ""),
  );
}

/** The index after the runner's subcommand, such as `exec` in `npm exec`, or 0. */
function subcommandEnd(
  subcommands: readonly (readonly string[])[],
  words: readonly string[],
): number {
  const lower = words.map((word) => word.toLowerCase());
  for (const subcommand of subcommands) {
    const start = lower.findIndex((_, index) =>
      subcommand.every((word, offset) => lower[index + offset] === word),
    );
    if (start !== -1) {
      return start + subcommand.length;
    }
  }
  return 0;
}
