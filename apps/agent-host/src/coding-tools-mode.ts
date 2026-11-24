// The agent host's `coding-tools` mode (HAL-16737, HAL-17183): the
// executable serves Halonic's coding tools server on standard input and
// output, for a harness program that starts it as its own child inside the
// fence. On Windows the host and its harness programs run inside Halonic's
// WSL distro, so this is the Linux executable there too, never a Windows one.
//
//   halonic-agent-host --profile-folder <folder> coding-tools [server arguments]
//
// `main.ts` runs it from the payload an earlier launch unpacked, without
// unpacking or claiming anything: the fence lets the program read the
// payload and the profile, never change them.

import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveCodingToolsOnProcess } from "@halonicjs/adapter-coding-tools";
import type { CodingToolsServer } from "@halonicjs/ports";

/** The mode's name, right after `--profile-folder <folder>`. */
export const codingToolsMode = "coding-tools";

/** A payload folder's name, as `main.ts` makes it: `<version>-<digest>`. */
const payloadFolderName = /^[0-9A-Za-z.+-]+-[0-9a-f]{16}$/;

/**
 * The payload folder this file was unpacked into, or `undefined` when the
 * host runs from the repo's source, which has no executable to start.
 *
 * @param file - this module's own path; tests pass another
 */
export function ownPayloadFolder(
  file: string = fileURLToPath(import.meta.url),
): string | undefined {
  // This file is `apps/agent-host/src/coding-tools-mode.ts` in the payload.
  const folder = join(dirname(file), "..", "..", "..");
  const unpacked =
    payloadFolderName.test(basename(folder)) && basename(dirname(folder)) === "agent-host";
  return unpacked ? folder : undefined;
}

/**
 * How a harness program starts the server through this executable, for
 * the profile builder; `undefined` when the host runs from source.
 *
 * @param profileFolder - the profile the host runs on, which `main.ts` finds the payload in
 */
export function agentHostCodingToolsServer(
  profileFolder: string,
  payload: string | undefined = ownPayloadFolder(),
  execPath: string = process.execPath,
): CodingToolsServer | undefined {
  if (payload === undefined) return undefined;
  return {
    program: execPath,
    args: ["--profile-folder", profileFolder, codingToolsMode],
    codePaths: [execPath, payload],
  };
}

/**
 * Serves the server on this process until its input ends.
 *
 * @param args - the arguments after `coding-tools`
 * @param payload - the payload folder `main.ts` checked and loads the host from
 * @returns the exit code
 */
export async function serveAgentHostCodingTools(
  args: readonly string[],
  payload: string,
): Promise<number> {
  return await serveCodingToolsOnProcess(args, [process.execPath, payload]);
}
