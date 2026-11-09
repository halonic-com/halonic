// Decides whether a stdio connector starts a package runner (`npx`, `uvx`
// and the others), and checks what such a launch needs before anything
// starts, as `app.package-runner-launch` asks. Pure: the stdio launcher
// calls it and refuses to start on a refusal.

import type { ConnectorPin, ConnectorTransport } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { checkPinVersion } from "./connector-pin.ts";

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

/** Variables that can run code before the package or load another one. */
const blockedNames = new Set([
  "node_options",
  "node_path",
  "pythonpath",
  "pythonstartup",
  "pythonhome",
]);

/** Prefixes of variables that can move the registry or change how the runner resolves. */
const blockedPrefixes = [
  "npm_config_",
  "yarn_",
  "pnpm_",
  "bun_",
  "corepack_",
  "uv_",
  "pip_",
  "pipx_",
];

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
 * `npm --yes exec`, doesn't hide it. A command that only looks like one
 * then needs a pin, which is the safe side to be wrong on.
 */
export function isPackageRunner(command: string, args: readonly string[]): boolean {
  const program = programName(command);
  if (runnerPrograms.has(program)) {
    return true;
  }
  const subcommands = runnerSubcommands.get(program) ?? [];
  const words = args.map((arg) => arg.toLowerCase());
  return subcommands.some((subcommand) => containsInOrder(words, subcommand));
}

/**
 * Checks a stdio transport before its program starts. A package runner needs
 * a `pin` with one exact version, and no transport with a pin may set a
 * variable, in any case, that could move the registry or run code before the
 * package. A command that isn't a package runner and has no pin passes as
 * it is.
 *
 * @returns the pin to start, `null` for a command that isn't a package
 *   runner, or the reason to refuse
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
    if (isPackageRunner(command, args)) {
      return err(
        `"${programName(command)}" fetches a package and runs it, so it needs a pin to one exact version, which this connector doesn't have`,
      );
    }
    return ok(null);
  }
  const blocked = Object.keys(env).filter(isBlockedVariable);
  if (blocked.length > 0) {
    return err(
      `the connector's environment sets ${blocked.join(", ")}, which could move the registry or run code before the pinned package`,
    );
  }
  return checkPinVersion(pin);
}

function isBlockedVariable(name: string): boolean {
  const lower = name.toLowerCase();
  return blockedNames.has(lower) || blockedPrefixes.some((prefix) => lower.startsWith(prefix));
}

/** Whether `words` holds `wanted` as a run of neighbours. */
function containsInOrder(words: readonly string[], wanted: readonly string[]): boolean {
  return words.some((_, start) => wanted.every((word, offset) => words[start + offset] === word));
}
