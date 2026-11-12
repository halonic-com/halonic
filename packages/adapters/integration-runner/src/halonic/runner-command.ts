// How the runner is started inside its session: Node with its permission
// model as the second layer behind the fence (design HAL-958, section 1 b).
// Node may read only the runner and the integration's folder. It gets no
// writes, no child processes, no workers, no add-ons, no WASI and no network,
// because none of those is allowed by a flag.
//
// The sandbox sets no memory limit, so the runner brings its own (A24). Node's
// heap limit makes a runner that fills its JavaScript heap die at it. Memory
// behind an `ArrayBuffer` or a typed array lies outside the heap, so on Linux
// the runner starts through `prlimit --data`, which caps the whole data
// segment and makes such an allocation fail with a `RangeError` (HAL-7565).
// macOS doesn't enforce that limit for `mmap` and Windows has no rlimits, so
// there only the heap limit holds; the gap stays open in the design (HAL-958).
// A Linux machine without `prlimit` (NixOS, a minimal Alpine) gets the same
// heap-limit-only start, so the runner can still start there (HAL-7794).

import type { SandboxCommand } from "@halonicjs/ports";
import { type RunnerArgs, runnerArgList } from "../runner-args.ts";
import type { RunnerFiles } from "./runner-profile.ts";

/**
 * The runner's heap limit in MiB. An integration's work is small: requests
 * and responses of a few MiB at most, so this leaves ample room while one
 * runner's heap can't take a machine's memory.
 */
export const runnerHeapLimitMiB = 256;

/**
 * What Node's own start takes of the data segment in MiB, before the
 * integration runs anything. Node 24 takes about 580, mostly the 512 MiB
 * range V8 reserves for code, so this leaves room for other Node versions.
 */
export const nodeBaseMiB = 640;

/** What an integration may keep in `ArrayBuffer`s and typed arrays on top of its heap, in MiB. */
export const bufferAllowanceMiB = 256;

/** What a test may change: a lower heap limit to reach it fast, and another system. */
export interface RunnerLimits {
  readonly heapLimitMiB?: number;
  /** The system, as `process.platform` names it; this one unless a test passes another. */
  readonly platform?: NodeJS.Platform;
  /** Whether `prlimit` is on this machine; the caller checks, and it is taken as there unless a caller says it isn't. */
  readonly prlimitAvailable?: boolean;
}

/** `prlimit` by its full path, because the runner's environment has no `PATH`. */
export const prlimitProgram = "/usr/bin/prlimit";

/** The data segment limit in MiB: Node's own start, the heap and the buffer allowance. */
export function dataLimitMiB(heapLimitMiB: number): number {
  return nodeBaseMiB + heapLimitMiB + bufferAllowanceMiB;
}

/** The command that starts the runner for one integration. */
export function runnerCommand(
  files: RunnerFiles,
  args: RunnerArgs,
  {
    heapLimitMiB = runnerHeapLimitMiB,
    platform = process.platform,
    prlimitAvailable = true,
  }: RunnerLimits = {},
): SandboxCommand {
  const node: SandboxCommand = {
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
  if (platform !== "linux" || !prlimitAvailable) return node;
  return {
    program: prlimitProgram,
    args: [`--data=${dataLimitMiB(heapLimitMiB) * 1024 * 1024}`, node.program, ...node.args],
  };
}
