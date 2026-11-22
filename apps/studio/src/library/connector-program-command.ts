import { isWindowsFolder } from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import { shellWord } from "@halonicjs/std";

/** What a program a connector starts is started with, as its file declares it. */
type StdioStart = Extract<Connector["transport"], { readonly stdio: unknown }>["stdio"];

/**
 * The line that starts a connector's program by hand, so the person can see why it stopped right
 * after it started (C634 #5): `cd` to the folder it starts in, then its command and args, each one
 * POSIX shell word. Its `env` and secrets aren't in it, as the CLI's "run the command and args"
 * leaves them out too. A Windows folder gets none: Studio starts the program there itself, and a
 * POSIX line wouldn't run in its terminal.
 *
 * @param location - the workspace folder's absolute path
 * @param start - the connector's `transport.stdio`
 * @returns the line, or `undefined` for a Windows folder
 * @example
 * connectorProgramCommand("/acme/Acme sample", { command: "npx", args: ["-y", "notes-mcp"] });
 * // 'cd "/acme/Acme sample" && npx -y notes-mcp'
 */
export function connectorProgramCommand(location: string, start: StdioStart): string | undefined {
  if (isWindowsFolder(location)) return undefined;
  const words = [start.command, ...start.args].map(shellWord);
  return `cd ${shellWord(startFolder(location, start.cwd))} && ${words.join(" ")}`;
}

/** The folder the program starts in: `cwd` read from the workspace folder, which it defaults to. */
function startFolder(location: string, cwd: string | undefined): string {
  if (cwd?.startsWith("/")) return cwd;
  const parts = (cwd ?? "").split("/").filter((part) => part !== "" && part !== ".");
  return [location.replace(/\/+$/u, ""), ...parts].join("/") || "/";
}
