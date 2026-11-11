import type { Readable } from "node:stream";
import { NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";
import { claudeCodeHarness } from "@halonicjs/adapter-harness-claude-code";
import { codexHarness } from "@halonicjs/adapter-harness-codex";
import { createProgramProbe } from "@halonicjs/adapter-sandbox-host";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { Harness } from "@halonicjs/ports";
import { BridgeTable, bridgeRoutes } from "./bridge/bridge-routes.ts";
import { harnessRoutes } from "./harness/harness-routes.ts";
import { RunTable } from "./harness/run-table.ts";
import { sandboxRoutes } from "./sandbox/sandbox-routes.ts";
import { SessionTable } from "./sandbox/session-table.ts";
import { healthRoute } from "./server/health-route.ts";
import { startHostServer } from "./server/host-server.ts";
import { randomLaunchToken } from "./server/launch-token.ts";

/** Where the host talks to the program that started it. */
export interface HostIo {
  /** The starter's end of the pipe: when it closes, the host stops. */
  input: Readable;
  write(text: string): void;
}

/** The first line the host prints when it serves: where it listens, and its token. */
export interface Handshake {
  url: string;
  token: string;
}

/**
 * The agent host, as the executable loads it from the unpacked payload.
 *
 * - `--version` prints its version;
 * - `--sandbox-check` prints whether the sandbox works on this machine, as JSON;
 * - `--sandbox-setup` sets the sandbox up, once, for the installer (see {@link SrtSandbox.setUp}), and prints whether it worked, as JSON;
 * - otherwise it serves on loopback (see {@link serve}).
 *
 * The two sandbox commands exit with 0 when the answer is `ok`, and 1 when it
 * isn't, so the installer needn't read the JSON.
 *
 * @param sandbox - the sandbox on this machine; tests pass one on a fake machine
 * @returns the exit code
 */
export async function run(
  args: readonly string[],
  version: string,
  io: HostIo = { input: process.stdin, write: (text) => process.stdout.write(text) },
  sandbox: SrtSandbox = new SrtSandbox(),
): Promise<number> {
  if (args.includes("--version")) {
    io.write(`halonic-agent-host ${version}\n`);
    return 0;
  }
  if (args.includes("--sandbox-check")) {
    return answer(io, await sandbox.check());
  }
  if (args.includes("--sandbox-setup")) {
    return answer(io, await sandbox.setUp());
  }
  await serve(version, io, sandbox);
  return 0;
}

/** Prints `result` as one JSON line. @returns its exit code: 0 when it is `ok`, 1 when not */
function answer(io: HostIo, result: { ok: boolean }): number {
  io.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}

/**
 * Serves on a free port of 127.0.0.1 with a token made for this launch, and
 * prints one {@link Handshake} line. The token goes only to the program that
 * started the host, on standard output: never in arguments, the environment
 * or a file, where other programs could read it. The host stops when its
 * standard input closes, so it never outlives that program.
 */
async function serve(version: string, io: HostIo, sandbox: SrtSandbox): Promise<void> {
  const token = randomLaunchToken();
  const sessions = new SessionTable();
  const bridges = new BridgeTable();
  const runs = new RunTable();
  const server = await startHostServer(token, [
    healthRoute(version),
    ...sandboxRoutes(sandbox, sessions),
    ...bridgeRoutes((secrets) => new NodeHarnessBridgeServer({ secrets }), bridges),
    ...harnessRoutes({ harnesses: hostHarnesses(version), sessions, bridges, runs }),
  ]);
  const handshake: Handshake = { url: server.url, token };
  io.write(`${JSON.stringify(handshake)}\n`);
  await inputClosed(io.input);
  // Stop the runs, then their sandboxed programs, so none outlives the host;
  // their bridges then have no caller.
  await runs.cancelAll();
  await sessions.closeAll();
  await bridges.closeAll();
  await server.close();
}

/** The harnesses the host runs: Claude Code and Codex, found with this computer's launcher. */
function hostHarnesses(version: string): Harness[] {
  const probe = createProgramProbe();
  return [claudeCodeHarness({ probe }), codexHarness({ probe, halonicVersion: version })];
}

function inputClosed(input: Readable): Promise<void> {
  return new Promise((resolve) => {
    input.once("end", resolve);
    input.once("close", resolve);
    input.once("error", () => resolve());
    // Nothing is read from the input yet; reading it lets its end arrive.
    input.resume();
  });
}
