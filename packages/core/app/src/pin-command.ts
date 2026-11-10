// How a pinned package runner reads its words, as `app.package-runner-launch`
// checks them and `app.pinned-runner-args` pins them: its own options, then
// the command word it starts, then the words it passes on. One reading for
// both, so the check and the launch can't disagree on what starts.

import type { ConnectorPin } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { isSamePackage, type PinRegistry } from "./connector-pin.ts";

/**
 * Runner options whose value names a package to fetch: `npx -p`, `npm exec
 * --package`, `uvx --from` and `--with`, `pipx run --spec`. `--with` may
 * list several, split by commas. With one of them, the runner starts its
 * command word as a program, found among the fetched packages or on `PATH`
 * (`pipx run --spec` finds it in a venv that also holds `python`).
 */
export const packageOptions = new Set(["-p", "--package", "--from", "--with", "--spec"]);

/** A pinned runner's words, split where the runner splits them. */
export interface RunnerWords {
  /** The words before the command word: the subcommand and the runner's own options. */
  readonly options: readonly string[];
  /**
   * The command word: the package to start, or with a package option the
   * program to start. `undefined` when the words name none.
   */
  readonly command: string | undefined;
  /** The words after the command word, which `npx` and `uvx` pass on to it. */
  readonly passedOn: readonly string[];
  /**
   * The words of `passedOn` before a `--`, which `npm exec` still reads as
   * its own options. Empty when a `--` comes before the command word.
   */
  readonly late: readonly string[];
  /** The first package option among `options`, such as `-p` or `--from`. */
  readonly packageOption: string | undefined;
  /**
   * The first package option among `passedOn` before a `--`. `npm exec`
   * reads it as its own option, `npx` and `uvx` pass it on, so a pin can't
   * say which package starts.
   */
  readonly lateOption: string | undefined;
}

/**
 * Splits a pinned runner's words at its command word: the first word after
 * its subcommand that doesn't start with `-` and isn't a package option's
 * value, or the word right after a `--`. An option that takes a value of
 * its own, such as `--python 3.12`, makes its value look like the command
 * word, which errs to the safe side: the check then refuses the launch.
 * `subcommands` are the runner's own, such as `exec` for `npm exec`.
 */
export function readRunnerWords(
  subcommands: readonly (readonly string[])[],
  words: readonly string[],
): RunnerWords {
  const start = subcommandEnd(subcommands, words);
  let index = 0;
  let afterDashes = false;
  while (index < words.length) {
    const word = words[index] ?? "";
    if (index >= start && word === "--") {
      afterDashes = true;
      index += 1;
      break;
    }
    if (index >= start && !word.startsWith("-") && packageOptionValue(words, index) === undefined) {
      break;
    }
    index += 1;
  }
  const options = words.slice(0, index);
  const passedOn = words.slice(index + 1);
  const late = afterDashes ? [] : wordsBeforeDashes(passedOn);
  return {
    options,
    command: words[index],
    passedOn,
    late,
    packageOption: options.map(optionName).find((name) => packageOptions.has(name)),
    lateOption: late.map(optionName).find((name) => packageOptions.has(name)),
  };
}

/**
 * The value a package option gives the word at `index`: the word itself
 * after `--from`, or the part after `=` of `--from=spec`. `undefined` when
 * the word there isn't a package option's value.
 */
export function packageOptionValue(words: readonly string[], index: number): string | undefined {
  const word = words[index] ?? "";
  const equals = word.indexOf("=");
  if (word.startsWith("-") && equals !== -1 && packageOptions.has(word.slice(0, equals))) {
    return word.slice(equals + 1);
  }
  const previous = words[index - 1];
  return previous !== undefined && packageOptions.has(previous) ? word : undefined;
}

/**
 * Checks the command word of a pinned runner. With a package option such
 * as `npx -p <pin> sh`, the runner starts its command word as a program,
 * which needn't come from the pin: it must be the pin's package name, with
 * or without its npm scope. Without one, the command word is the package
 * the runner fetches, which must be the pin's. A package option after the
 * command word, before a `--`, is refused (`RunnerWords.lateOption`). The
 * words are read once with `readRunnerWords`, for this check and the launch.
 */
export function checkCommandWord(
  pin: ConnectorPin,
  { command, packageOption, lateOption }: RunnerWords,
): Result<ConnectorPin, string> {
  if (lateOption !== undefined) {
    return err(
      `the command sets ${lateOption} after "${command}", which one runner reads as its own option and another passes on, so a pin can't be checked`,
    );
  }
  if (packageOption === undefined) {
    return command !== undefined && namesPin(pin, command)
      ? ok(pin)
      : err(`the command starts "${command ?? ""}", but the pin is for "${pin.package}"`);
  }
  if (command === undefined) {
    return err(`the command fetches the pin with ${packageOption} but names no program to run`);
  }
  const allowed = [...new Set([pin.package, pin.package.replace(/^@[^/]+\//, "")])];
  if (allowed.some((name) => isSamePackage(pin.registry, command, name))) {
    return ok(pin);
  }
  const names = allowed.map((name) => `"${name}"`).join(" or ");
  return err(
    `the command fetches the pin with ${packageOption} but runs "${command}", and a pinned runner may only run ${names}`,
  );
}

/** Whether a word names the pin's package, at any version or none. */
export function namesPin(pin: ConnectorPin, word: string): boolean {
  const name = leadingName(pin.registry, word);
  return name !== "" && isSamePackage(pin.registry, name, pin.package);
}

/**
 * The package name a word starts with: up to the `@` after the name for npm
 * (`@acme/mail-mcp@2.3.1`), up to the first character a name can't hold for
 * PyPI (`mail-mcp==2.3.1`).
 */
export function leadingName(registry: PinRegistry, word: string): string {
  if (registry === "npm") {
    const at = word.indexOf("@", word.startsWith("@") ? 1 : 0);
    return at === -1 ? word : word.slice(0, at);
  }
  return /^[A-Za-z0-9._-]*/.exec(word)?.[0] ?? "";
}

/** The words before the first `--`, or all of them without one. */
function wordsBeforeDashes(words: readonly string[]): readonly string[] {
  const dashes = words.indexOf("--");
  return dashes === -1 ? words : words.slice(0, dashes);
}

/** The option a word sets, before any `=`, or the word itself. */
export function optionName(word: string): string {
  return word.startsWith("-") ? (word.split("=", 1)[0] ?? word) : word;
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
