// How a harness names Halonic's coding tools server to its program: the
// server's name, its tools and the command that starts it for one run.
// Web-safe; the check of where the server's code lies, which reads paths
// under this computer's rules, is in `coding-tools-server.ts`.

import type { HarnessTask, SandboxSession } from "@halonicjs/ports";

/** The name a harness gives the server in its program's MCP settings, so its tools are `mcp__halonic-tools__…`. */
export const codingToolsServerName = "halonic-tools";

/**
 * The server's tools that only read: a harness lets its program use them
 * without asking, as it does its own `Read`.
 */
export const readOnlyCodingTools: readonly string[] = ["read_ranges", "search", "repo_map"];

/**
 * The server's tools that run the workspace's code: every call asks a
 * person first, as a shell command does.
 */
export const askingCodingTools: readonly string[] = ["run_tests"];

/** Which of the server's tools a harness asks for: all four, or the three that only read. */
export type CodingToolsChoice = "all" | "read-only";

/** The command that starts the server for one run, for the program's MCP settings. */
export interface CodingToolsCommand {
  readonly command: string;
  readonly args: readonly string[];
}

/** The shortest test time limit the server takes, in seconds. */
const leastTestSeconds = 10;

/**
 * How the harness's program starts the coding tools server for this run,
 * or `null` when it names none: when the host gave no server, or the
 * session isn't `fenced` (an unknown or missing fence state counts as not
 * fenced). The test time limit is the session's, so a test run never
 * outlasts the step.
 */
export function codingToolsCommand(
  task: Pick<HarnessTask, "codingTools">,
  session: Pick<SandboxSession, "fence" | "profile">,
  choice: CodingToolsChoice,
): CodingToolsCommand | null {
  const server = task.codingTools;
  if (server === undefined || session.fence?.state !== "fenced") return null;
  const args = [...server.args, "--temp-folder", session.profile.tempFolder, "--tools", choice];
  const seconds = Math.floor(session.profile.timeLimitMs / 1_000);
  if (seconds >= leastTestSeconds) args.push("--max-test-seconds", String(seconds));
  return { command: server.program, args };
}
