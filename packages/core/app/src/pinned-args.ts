// The arguments a pinned package runner starts with: the configured ones,
// with the pin's version added where the runner reads the package. Pure:
// the stdio launcher calls it once `checkPackageRunnerLaunch` has passed.

import type { ConnectorPin } from "@halonicjs/ports";
import { programName, runnerSubcommandsOf } from "./package-runner.ts";
import { leadingName, namesPin, packageOptionValue, readRunnerWords } from "./pin-command.ts";

/**
 * The arguments to start a pinned package runner with, for a `command` and
 * `args` that `checkPackageRunnerLaunch` let through. Only the runner's own
 * words change, read with `readRunnerWords` as the check reads them: each
 * package option's value that names the pin's package, such as
 * `--package=@acme/mail-mcp` or `--from mail-mcp`, names it at the pin's
 * version (each of a `--with` list). Without a package option, the command
 * word is the package, and it names it at the pin's version. With one, the
 * command word is a program name, such as `mail-mcp` in
 * `uvx --from mail-mcp mail-mcp`, which a version would break. The words
 * after the command word are the server's own and stay as they are.
 *
 * @example
 * pinnedRunnerArgs(pin, "npx", ["-y", "@acme/mail-mcp"]); // ["-y", "@acme/mail-mcp@2.3.1"]
 */
export function pinnedRunnerArgs(
  pin: ConnectorPin,
  command: string,
  args: readonly string[],
): string[] {
  const program = programName(command);
  const runner = readRunnerWords(runnerSubcommandsOf(program), args);
  const options = runner.options.map((_, index) => pinnedOption(pin, runner.options, index));
  if (runner.command === undefined) {
    return options;
  }
  const started =
    runner.packageOption === undefined
      ? pinnedCommand(pin, program, runner.command)
      : [runner.command];
  return [...options, ...started, ...runner.passedOn];
}

/** A runner option word, with a package option's value naming the pin at its version. */
function pinnedOption(pin: ConnectorPin, words: readonly string[], index: number): string {
  const word = words[index] ?? "";
  const value = packageOptionValue(words, index);
  if (value === undefined) {
    return word;
  }
  const pinned = value
    .split(",")
    .map((spec) => (namesPin(pin, spec) ? requirementSpec(pin) : spec))
    .join(",");
  return `${word.slice(0, word.length - value.length)}${pinned}`;
}

/**
 * The words that start the pinned package as a command word, the way each
 * runner documents a version there: `@acme/mail-mcp@2.3.1` for npm runners,
 * `mail-mcp@2.3.1` for `uvx` and `uv tool run`. `pipx run` documents a
 * version only with `--spec`, so it gets `--spec mail-mcp==2.3.1 mail-mcp`.
 * `checkPackageRunnerLaunch` has made sure the command word names the pin.
 */
function pinnedCommand(pin: ConnectorPin, program: string, command: string): string[] {
  if (pin.registry === "pypi" && program === "pipx") {
    return ["--spec", requirementSpec(pin), leadingName(pin.registry, command)];
  }
  return [`${pin.package}@${pin.version}`];
}

/** The pinned package at its version, as a package option's value writes it. */
function requirementSpec(pin: ConnectorPin): string {
  return pin.registry === "npm"
    ? `${pin.package}@${pin.version}`
    : `${pin.package}==${pin.version}`;
}
