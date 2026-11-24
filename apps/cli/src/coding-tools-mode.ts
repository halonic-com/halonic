// The CLI's `coding-tools` mode (HAL-16737, HAL-17183): `halonic
// coding-tools …` serves Halonic's coding tools server on standard input
// and output, for a harness program that starts it as its own child inside
// the fence. `bin/halonic.js` runs it before `main.ts`, so nothing else the
// CLI does at start (clean-up, its own output) gets between the program and
// the server's lines.

import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveCodingToolsOnProcess } from "@halonicjs/adapter-coding-tools";
import type { CodingToolsServer } from "@halonicjs/ports";

/** The mode's name, the CLI's first argument. */
export const codingToolsMode = "coding-tools";

/** The CLI's package folder: `apps/cli` in the repo, or the installed `halonic` package. */
const cliFolder = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));

/**
 * The folder that holds all the code the server loads. From the repo, the
 * workspace packages are links into the repo, so that is the repo's root;
 * an installed CLI holds its packages in its own folder.
 */
export function codingToolsCodeRoot(folder: string = cliFolder): string {
  const repoRoot = join(folder, "..", "..");
  return existsSync(join(repoRoot, "pnpm-workspace.yaml")) ? realpathSync(repoRoot) : folder;
}

/**
 * How a harness program starts the server through this CLI: the same Node
 * with the same entry, in the `coding-tools` mode. `undefined` on Windows,
 * where a harness runs only inside the WSL distro and never starts a
 * Windows program.
 */
export function cliCodingToolsServer(
  platform: NodeJS.Platform = process.platform,
  execPath: string = process.execPath,
): CodingToolsServer | undefined {
  if (platform === "win32") return undefined;
  const runtime = realpathSync(execPath);
  return {
    program: runtime,
    args: [join(cliFolder, "bin", "halonic.js"), codingToolsMode],
    codePaths: [runtime, codingToolsCodeRoot()],
  };
}

/**
 * Serves the server on this process until its input ends.
 *
 * @param args - the arguments after `coding-tools`
 * @returns the exit code
 */
export async function serveCliCodingTools(args: readonly string[]): Promise<number> {
  return await serveCodingToolsOnProcess(args, [
    realpathSync(process.execPath),
    codingToolsCodeRoot(),
  ]);
}
