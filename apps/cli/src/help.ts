import type { CliCommand, CliOption } from "./command.ts";

/** The help for `halonic` on its own: every command with its summary. */
export function overallHelp(commands: readonly CliCommand[]): string[] {
  const width = Math.max(0, ...commands.map((command) => command.name.length));
  return [
    "Usage: halonic <command> [arguments]",
    "",
    "Commands:",
    ...commands.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`),
    "",
    "Run halonic <command> --help for a command's arguments and options.",
  ];
}

/** The help for one command: its usage line, its summary and its options. */
export function commandHelp(command: CliCommand): string[] {
  const lines = [usageLine(command), "", command.summary];
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
  return lines;
}

/** `Usage: halonic <name> <arguments>`, the line printed with a usage error. */
export function usageLine(command: CliCommand): string {
  return `Usage: halonic ${command.name}${command.usage === "" ? "" : ` ${command.usage}`}`;
}

function optionLabel(name: string, option: CliOption): string {
  if (option.type === "boolean") {
    return `--${name}`;
  }
  return `--${name} <${option.valueName ?? "value"}>`;
}
