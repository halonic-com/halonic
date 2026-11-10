// The arguments a pinned package runner starts with: the configured ones,
// with the pin's version added where they name the pinned package. Pure:
// the stdio launcher calls it once `checkPackageRunnerLaunch` has passed.

import type { ConnectorPin } from "@halonicjs/ports";
import { isSamePackage } from "./connector-pin.ts";
import { leadingName } from "./package-runner.ts";
import { packageOptions } from "./pin-command.ts";

/**
 * The arguments to start a pinned package runner with, for `args` that
 * `checkPackageRunnerLaunch` let through. Every package option's value that
 * names the pin's package, such as `--package=@acme/mail-mcp` or
 * `--from mail-mcp`, names it at the pin's version (each of a `--with` list).
 * Without a package option, the first word naming the pin's package is the
 * package, and it names it at the pin's version. Every other word stays as
 * it is: with a package option, the command word is a program name, such as
 * `mail-mcp` in `uvx --from mail-mcp mail-mcp`, which a version would break.
 *
 * @example
 * pinnedRunnerArgs(pin, ["-y", "@acme/mail-mcp"]); // ["-y", "@acme/mail-mcp@2.3.1"]
 */
export function pinnedRunnerArgs(pin: ConnectorPin, args: readonly string[]): string[] {
  const hasPackageOption = args.some((arg) => packageOptions.has(optionName(arg)));
  let pinnedPositional = hasPackageOption;
  return args.map((arg, index) => {
    if (packageOptions.has(args[index - 1] ?? "")) {
      return pinnedList(pin, arg);
    }
    const equals = arg.indexOf("=");
    if (arg.startsWith("--") && equals !== -1 && packageOptions.has(arg.slice(0, equals))) {
      return `${arg.slice(0, equals + 1)}${pinnedList(pin, arg.slice(equals + 1))}`;
    }
    if (!pinnedPositional && namesPin(pin, arg)) {
      pinnedPositional = true;
      return exactSpec(pin);
    }
    return arg;
  });
}

/** The option an argument sets, before any `=`. */
function optionName(arg: string): string {
  return arg.startsWith("--") ? (arg.split("=", 1)[0] ?? arg) : arg;
}

/** A package option's value, with each spec naming the pin's package at its version. */
function pinnedList(pin: ConnectorPin, value: string): string {
  return value
    .split(",")
    .map((spec) => (namesPin(pin, spec) ? exactSpec(pin) : spec))
    .join(",");
}

function namesPin(pin: ConnectorPin, word: string): boolean {
  const name = leadingName(pin.registry, word);
  return name !== "" && isSamePackage(pin.registry, name, pin.package);
}

/** The pinned package at its version, as its registry's runners write it. */
function exactSpec(pin: ConnectorPin): string {
  return pin.registry === "npm"
    ? `${pin.package}@${pin.version}`
    : `${pin.package}==${pin.version}`;
}
