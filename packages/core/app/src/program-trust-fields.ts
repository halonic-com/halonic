import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { programName } from "./package-runner.ts";

/**
 * What a program connector's row in the trust check shows, read from its trust content and not
 * yet escaped. The CLI's `halonic trust` and Studio's trust check both build their Programs rows
 * from it, so the two show the same fields (HAL-16323).
 */
export interface ProgramTrustFields {
  /** The command and its arguments, as one line: "npx @acme/mail-mcp 2.3.1". */
  readonly command: string;
  /** The variables it takes from the person's environment, by name, sorted. */
  readonly inherited: readonly string[];
  /** Where the command is on this computer, when it was found. */
  readonly path: string | undefined;
  /** The folder it starts in, when it isn't the workspace's own (`.`). */
  readonly workingFolder: string | undefined;
  /** Its own `env` entries as written, one `NAME=value` each, sorted by name. */
  readonly environment: readonly string[];
  /** The sites it may reach in a sandbox, in their stored form. */
  readonly sites: readonly string[];
  /** Where it downloads new code from when its version isn't pinned. */
  readonly registry: "npm" | "PyPI";
}

/**
 * The fields of a program connector's trust row.
 *
 * @example
 * programTrustFields(connector).environment; // ["NODE_ENV=production"]
 */
export function programTrustFields(connector: ConnectorTrustContent): ProgramTrustFields {
  const { settings } = connector;
  const command = text(settings["command"]);
  const words = [command, ...strings(settings["args"])];
  const path = text(settings["path"]);
  const cwd = text(settings["cwd"]);
  return {
    command: words.join(" "),
    inherited: strings(settings["inheritEnv"]),
    path: path === "" ? undefined : path,
    workingFolder: cwd === "" || cwd === "." ? undefined : cwd,
    environment: Object.entries(record(settings["env"]))
      .sort(([first], [second]) => first.localeCompare(second, "en"))
      .map(([name, value]) => `${name}=${text(value)}`),
    sites: strings(settings["sites"]),
    registry: registryOf(command, words),
  };
}

/** PyPI for `uvx`, `uv tool run` and `pipx run`; npm for every other package runner. */
function registryOf(command: string, words: readonly string[]): "npm" | "PyPI" {
  const python = new Set(["uvx", "uv", "pipx"]);
  return python.has(programName(command)) || words.some((word) => python.has(programName(word)))
    ? "PyPI"
    : "npm";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
