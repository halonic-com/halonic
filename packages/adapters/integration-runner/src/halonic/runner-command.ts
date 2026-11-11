// How the runner is started inside its session: Node with its permission
// model as the second layer behind the fence (design HAL-958, section 1 b).
// Node may read only the runner and the integration's folder. It gets no
// writes, no child processes, no workers, no add-ons, no WASI and no network,
// because none of those is allowed by a flag.

import type { SandboxCommand } from "@halonicjs/ports";
import { type RunnerArgs, runnerArgList } from "../runner-args.ts";
import type { RunnerFiles } from "./runner-profile.ts";

/** The command that starts the runner for one integration. */
export function runnerCommand(files: RunnerFiles, args: RunnerArgs): SandboxCommand {
  return {
    program: files.node,
    args: [
      "--permission",
      `--allow-fs-read=${files.runnerFile}`,
      `--allow-fs-read=${files.integrationFolder}`,
      files.runnerFile,
      ...runnerArgList(args),
    ],
  };
}
