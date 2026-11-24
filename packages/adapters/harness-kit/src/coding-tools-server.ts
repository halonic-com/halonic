// Halonic's coding tools server, as a harness names it to its program
// (HAL-16737, HAL-16753). The program starts it as its own child, inside
// the same fence. Two checks keep it from being a way round that fence:
// the profile builder names it only when nothing the program may write
// holds its code (checked here, from outside, before anything in the
// sandbox runs), and a harness names it only for a `fenced` session, since
// outside Halonic's fence a program's own sandbox wraps only its shell
// commands and an MCP server would run unfenced.

import type { CodingToolsServer, HarnessTask, SandboxSession } from "@halonicjs/ports";
import { isInsideOrSame, overlaps } from "./working-folder.ts";

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

/** Where a run's program may write, and what it may not read. */
export interface CodingToolsRunFolders {
  /** Every folder the profile lets the program write, at its real place. */
  readonly writable: readonly string[];
  /** Whether the profile hides `path` from the program. */
  isDenied(path: string): boolean;
}

/**
 * `server` when the run's program can read its code and can't change it:
 * it names at least one code path, its program lies inside one, none of
 * its code paths is, holds or is inside a writable folder, and none is
 * denied. `undefined` otherwise, so the run names no server (requirement
 * `harness-kit.coding-tools-server`). Every path must be at its real place,
 * as the writable folders are, so a link can't hide where the code is.
 * This is the check that counts: the server checks itself again when it
 * starts, but code rewritten before that would skip its own check.
 */
export function allowedCodingTools(
  server: CodingToolsServer | undefined,
  folders: CodingToolsRunFolders,
): CodingToolsServer | undefined {
  if (server === undefined || server.codePaths.length === 0) return undefined;
  if (!server.codePaths.some((code) => isInsideOrSame(server.program, code))) return undefined;
  const allowed = server.codePaths.every(
    (code) => !folders.writable.some((folder) => overlaps(code, folder)) && !folders.isDenied(code),
  );
  return allowed ? server : undefined;
}

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
