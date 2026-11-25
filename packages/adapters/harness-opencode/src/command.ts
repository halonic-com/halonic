import type { HarnessTask, SandboxCommand } from "@halonicjs/ports";
import { opencodeProgram } from "./detect.ts";

/**
 * The command that runs OpenCode for one task (requirement
 * `harness-opencode.command`):
 *
 * - `run` with no message: the prompt goes on standard input, never in the
 *   arguments, which every program on the computer can see.
 * - `--standalone`: a private server inside the fence, never the shared
 *   background service (and never `--server`).
 * - `--auto`: approves every tool not denied. The harness runs only for
 *   `asks: in-sandbox` in a proven fence, so Halonic's fence is the limit.
 * - `--archived`: the session isn't kept as an open one.
 * - `--format json`: one JSON event per line on standard output.
 * - `--title`: the agent's id, so OpenCode makes no model call for a title.
 */
export function opencodeCommand(task: Pick<HarnessTask, "agentId">): SandboxCommand {
  return {
    program: opencodeProgram,
    args: [
      "run",
      "--standalone",
      "--auto",
      "--archived",
      "--format",
      "json",
      "--title",
      task.agentId,
    ],
  };
}
