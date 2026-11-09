// Decides whether a stdio connector starts a package runner (`npx`, `uvx`
// and the others), and checks what such a launch needs before anything
// starts, as `app.package-runner-launch` asks. Pure: the stdio launcher
// calls it and refuses to start on a refusal.

import type { ConnectorPin, ConnectorTransport } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { checkPinVersion, isSamePackage, type PinRegistry } from "./connector-pin.ts";
import { readPackageSpec } from "./package-spec.ts";
import { findBlockedVariables, findRegistryOptions } from "./pin-overrides.ts";

/** The stdio transport, which is the only one that starts a program. */
export type StdioTransport = Extract<ConnectorTransport, { kind: "stdio" }>;

/** Programs that fetch a package and run it on their own. */
const runnerPrograms = new Set(["npx", "bunx", "uvx", "pnpx"]);

/**
 * Programs that fetch and run a package with one of these subcommands, such
 * as `npm exec` or `pipx run`. `npm x`, `bun x` and `pnpx` are the aliases
 * those tools document.
 */
const runnerSubcommands: ReadonlyMap<string, readonly (readonly string[])[]> = new Map([
  ["npm", [["exec"], ["x"]]],
  ["pnpm", [["dlx"]]],
  ["yarn", [["dlx"]]],
  ["bun", [["x"]]],
  ["pipx", [["run"]]],
  ["uv", [["tool", "run"]]],
]);

/**
 * Shells that can start a runner from their arguments, such as
 * `cmd /c npx -y @acme/mail-mcp`, a form many Windows setups use.
 */
const shellPrograms = new Set(["cmd", "sh", "bash", "zsh", "powershell", "pwsh"]);

/** What splits a shell's arguments into the words it runs. */
const shellSeparators = /[\s"'`;&|()]+/;

/**
 * Runner options whose value names a package to fetch: `npx -p`, `npm exec
 * --package`, `uvx --from` and `--with`, `pipx run --spec`. `--with` may
 * list several, split by commas.
 */
const packageOptions = new Set(["-p", "--package", "--from", "--with", "--spec"]);

/**
 * The program a command starts, as the runner rules compare it: without its
 * folder, in lowercase, and without a `.cmd`, `.exe`, `.bat` or `.ps1` ending.
 */
export function programName(command: string): string {
  const base = command.split(/[/\\]/).pop() ?? "";
  return base.toLowerCase().replace(/\.(?:cmd|exe|bat|ps1)$/, "");
}

/**
 * Whether a stdio command starts a package runner. A subcommand counts
 * wherever it appears in the arguments, so an option before it, such as
 * `npm --yes exec`, doesn't hide it. A shell counts when any word of its
 * arguments starts a runner, so `cmd /c npx …` does. A command that only
 * looks like one is then shown as not pinned when a person trusts it, which
 * is the safe side to be wrong on.
 * The trust check's `unpinned` flag (build plan item 10c) uses this, so the
 * launcher and the trust prompt agree on what a package runner is.
 */
export function isPackageRunner(command: string, args: readonly string[]): boolean {
  return runnerWords(command, args) !== undefined;
}

/**
 * The words a package runner reads after its program name, or `undefined`
 * when the command doesn't start one. For a shell they are the words after
 * the first runner its arguments name.
 */
function runnerWords(command: string, args: readonly string[]): readonly string[] | undefined {
  const program = programName(command);
  if (shellPrograms.has(program)) {
    const words = args.flatMap((arg) => arg.split(shellSeparators)).filter((word) => word !== "");
    for (const [start, word] of words.entries()) {
      const found = runnerWords(word, words.slice(start + 1));
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (runnerPrograms.has(program)) {
    return args;
  }
  const subcommands = runnerSubcommands.get(program) ?? [];
  const words = args.map((arg) => arg.toLowerCase());
  return subcommands.some((subcommand) => containsInOrder(words, subcommand)) ? args : undefined;
}

/**
 * Checks a stdio transport before its program starts. A transport without a
 * `pin` passes as it is, package runner or not: the trust grant, whose
 * fingerprint holds the command and args, is what lets it start. A `pin`
 * needs one exact version, and no transport with a pin may set a variable,
 * in any case, that could move the registry, send it through a proxy, trust
 * another certificate or load code before the package. A pinned runner may
 * not take an option that fetches from another registry, index, folder,
 * config or cache, must name the pin's package, and every package it names,
 * as an argument or as the value of a package option, must be the pin's
 * package at no version or the pin's version.
 *
 * @returns the pin to start, `null` for a transport without one, or the
 *   reason to refuse
 *
 * @example
 * const check = checkPackageRunnerLaunch(transport);
 * if (!check.ok) throw new Error(`Halonic didn't start the connector: ${check.error}`);
 */
export function checkPackageRunnerLaunch(
  transport: StdioTransport,
): Result<ConnectorPin | null, string> {
  const { command, args, env, pin } = transport;
  if (pin === undefined) {
    return ok(null);
  }
  const variables = findBlockedVariables(env);
  if (variables !== undefined) {
    return err(
      `the connector's environment sets ${variables.names.join(", ")}, which ${variables.reason}`,
    );
  }
  const pinned = checkPinVersion(pin);
  const words = runnerWords(command, args);
  if (!pinned.ok || words === undefined) {
    return pinned;
  }
  const options = findRegistryOptions(words);
  if (options.length > 0) {
    return err(
      `the command sets ${options.join(", ")}, which could fetch the pinned package from somewhere other than ${pin.registryUrl}`,
    );
  }
  return checkNamedPackages(pin, words);
}

/**
 * Checks the packages a pinned runner's words name against the pin. A word
 * names a package when it is a package option's value, or when it starts
 * with the pin's package name, such as `@acme/mail-mcp@3.0.0`. The pin's
 * package without a version is fine, because the launcher adds the pin.
 */
function checkNamedPackages(
  pin: ConnectorPin,
  words: readonly string[],
): Result<ConnectorPin, string> {
  const named = words.flatMap((word, index) => {
    const option = optionValue(words, index);
    if (option !== undefined) {
      return option.split(",").filter((spec) => spec !== "");
    }
    return isSamePackage(pin.registry, leadingName(pin.registry, word), pin.package) ? [word] : [];
  });
  if (named.length === 0) {
    return err(
      `the command doesn't name the pinned package "${pin.package}", so the launcher can't start it at ${pin.version}`,
    );
  }
  for (const spec of named) {
    const checked = checkNamedPackage(pin, spec);
    if (!checked.ok) {
      return checked;
    }
  }
  return ok(pin);
}

function checkNamedPackage(pin: ConnectorPin, spec: string): Result<ConnectorPin, string> {
  const bare = leadingName(pin.registry, spec) === spec;
  const read = bare
    ? ok({ package: spec, version: pin.version })
    : readPackageSpec(pin.registry, asRegistrySpec(pin.registry, spec));
  if (!read.ok) {
    return err(`the command asks for "${spec}", which the pin doesn't allow: ${read.error}`);
  }
  const named = read.value;
  if (!isSamePackage(pin.registry, named.package, pin.package)) {
    return err(
      `the command asks for the package "${named.package}", but the pin is for "${pin.package}"`,
    );
  }
  if (named.version !== pin.version) {
    return err(
      `the command asks for ${pin.package} ${named.version}, but the pin is ${pin.version}`,
    );
  }
  return ok(pin);
}

/**
 * The value of the package option at `index`, written `--from spec` or
 * `--from=spec`, or `undefined` when the word there isn't one.
 */
function optionValue(words: readonly string[], index: number): string | undefined {
  const word = words[index] ?? "";
  const equals = word.indexOf("=");
  if (word.startsWith("--") && equals !== -1 && packageOptions.has(word.slice(0, equals))) {
    return word.slice(equals + 1);
  }
  const previous = words[index - 1];
  return previous !== undefined && packageOptions.has(previous) ? word : undefined;
}

/**
 * The package name a word starts with: up to the `@` after the name for npm
 * (`@acme/mail-mcp@2.3.1`), up to the first character a name can't hold for
 * PyPI (`mail-mcp==2.3.1`).
 */
function leadingName(registry: PinRegistry, word: string): string {
  if (registry === "npm") {
    const at = word.indexOf("@", word.startsWith("@") ? 1 : 0);
    return at === -1 ? word : word.slice(0, at);
  }
  return /^[A-Za-z0-9._-]*/.exec(word)?.[0] ?? "";
}

/** `uvx` also reads `mail-mcp@2.3.1`; the PyPI rules read it as `mail-mcp==2.3.1`. */
function asRegistrySpec(registry: PinRegistry, spec: string): string {
  if (registry === "pypi") {
    return spec.replace(/^([A-Za-z0-9._-]+)@(?=[^:/\\]*$)/, "$1==");
  }
  return spec;
}

/** Whether `words` holds `wanted` as a run of neighbours. */
function containsInOrder(words: readonly string[], wanted: readonly string[]): boolean {
  return words.some((_, start) => wanted.every((word, offset) => words[start + offset] === word));
}
