import type { CliCommand, CliOption, CommandPath } from "./command.ts";
import { exitCodeMeanings, stoppedMeaning } from "./exit-code.ts";
import { globalOptionFlags } from "./global-options.ts";

/** Every help line fits a terminal this wide (cli-output 1.9). */
const helpWidth = 80;

/**
 * The help for `halonic` on its own: what it's for, every command with its
 * summary, the options every command takes, then the exit codes.
 */
export function overallHelp(commands: readonly CliCommand[]): string[] {
  return [
    "Run and check Halonic workspaces from the command line.",
    "",
    "Usage: halonic <command> [arguments]",
    "",
    ...commandList(commands),
    "",
    `Options for every command: ${globalOptionFlags.join(", ")}`,
    "",
    ...exitCodeHelp(),
    "",
    "Run halonic <command> --help for a command's arguments and options.",
  ];
}

/**
 * The help for one command: its usage line, its summary, its subcommands and
 * its options. A command with subcommands ends with where to find theirs.
 */
export function commandHelp(path: CommandPath): string[] {
  const command = lastOf(path);
  const lines = [usageLine(path), "", command.summary];
  const subcommands = command.subcommands ?? [];
  if (subcommands.length > 0) {
    lines.push("", ...commandList(subcommands));
  }
  const options = Object.entries(command.options).map(([name, option]) => [
    optionLabel(name, option),
    option.description,
  ]);
  if (options.length > 0) {
    const width = Math.max(...options.map(([label = ""]) => label.length));
    lines.push(
      "",
      "Options:",
      ...options.map(([label = "", text]) => `  ${label.padEnd(width)}  ${text}`),
    );
  }
  if (subcommands.length > 0) {
    lines.push(
      "",
      `Run halonic ${commandWords(path)} <command> --help for a command's arguments and options.`,
    );
  }
  return lines;
}

/** `Usage: halonic <words> <arguments>`, the line printed with a usage error. */
export function usageLine(path: CommandPath): string {
  const { usage } = lastOf(path);
  return `Usage: halonic ${commandWords(path)}${usage === "" ? "" : ` ${usage}`}`;
}

/** The words that name a command after `halonic`, such as `runs show`. */
export function commandWords(path: CommandPath): string {
  return path.map((command) => command.name).join(" ");
}

/** The command that runs: the last word of the path. */
export function lastOf(path: CommandPath): CliCommand {
  return path[path.length - 1] ?? path[0];
}

/** "Commands:" and one line per command with its summary, the names in one column. */
function commandList(commands: readonly CliCommand[]): string[] {
  const width = Math.max(0, ...commands.map((command) => command.name.length));
  return [
    "Commands:",
    ...commands.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`),
  ];
}

/**
 * The exit codes in code order, ending with the codes for a stopped command,
 * on as many lines as it takes to keep each within {@link helpWidth} columns.
 * A line breaks only after a "·", never inside one code's words.
 */
function exitCodeHelp(): string[] {
  const entries = [
    ...exitCodeMeanings.map(({ code, meaning }) => `${code} ${meaning}`),
    stoppedMeaning,
  ];
  const lines: string[] = [];
  let line = "Exit codes:";
  for (const [index, entry] of entries.entries()) {
    const text = index === entries.length - 1 ? entry : `${entry} ·`;
    if (line.length + 1 + text.length > helpWidth) {
      lines.push(line);
      line = text;
    } else {
      line = `${line} ${text}`;
    }
  }
  lines.push(line);
  return lines;
}

function optionLabel(name: string, option: CliOption): string {
  if (option.type === "boolean") {
    return `--${name}`;
  }
  return `--${name} <${option.valueName ?? "value"}>`;
}
