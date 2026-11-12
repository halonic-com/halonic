// How the runner is started inside its session: Node with its permission
// model as the second layer behind the fence (design HAL-958, section 1 b).
// Node may read only the runner and the integration's folder. It gets no
// writes, no child processes, no workers, no add-ons, no WASI and no network,
// because none of those is allowed by a flag.
//
// The sandbox sets no memory limit, so Node's own heap limit is the one the
// runner has: an integration that fills its JavaScript heap makes the runner
// die at it, and only the runner (A24). Memory behind an `ArrayBuffer` or a
// typed array lies outside the heap, and no limit covers it yet (HAL-7565).

import type { SandboxCommand } from "@halonicjs/ports";
import { type RunnerArgs, runnerArgList } from "../runner-args.ts";
import type { RunnerFiles } from "./runner-profile.ts";

/**
 * The runner's heap limit in MiB. An integration's work is small: requests
 * and responses of a few MiB at most, so this leaves ample room while one
 * runner's heap can't take a machine's memory.
 */
export const runnerHeapLimitMiB = 256;

/** The command that starts the runner for one integration. Tests lower the heap limit. */
export function runnerCommand(
  files: RunnerFiles,
  args: RunnerArgs,
  heapLimitMiB: number = runnerHeapLimitMiB,
): SandboxCommand {
  return {
    program: files.node,
    args: [
      "--permission",
      `--allow-fs-read=${files.runnerFile}`,
      `--allow-fs-read=${files.integrationFolder}`,
      `--max-old-space-size=${heapLimitMiB}`,
      files.runnerFile,
      ...runnerArgList(args),
    ],
  };
}
