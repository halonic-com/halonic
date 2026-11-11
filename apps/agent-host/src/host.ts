import type { Readable } from "node:stream";
import { NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { BridgeTable, bridgeRoutes } from "./bridge/bridge-routes.ts";
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
 * - otherwise it serves on loopback (see {@link serve}).
 *
 * @returns the exit code
 */
export async function run(
  args: readonly string[],
  version: string,
  io: HostIo = { input: process.stdin, write: (text) => process.stdout.write(text) },
): Promise<number> {
  if (args.includes("--version")) {
    io.write(`halonic-agent-host ${version}\n`);
  } else if (args.includes("--sandbox-check")) {
    io.write(`${JSON.stringify(await new SrtSandbox().check())}\n`);
  } else {
    await serve(version, io);
  }
  return 0;
}

/**
 * Serves on a free port of 127.0.0.1 with a token made for this launch, and
 * prints one {@link Handshake} line. The token goes only to the program that
 * started the host, on standard output: never in arguments, the environment
 * or a file, where other programs could read it. The host stops when its
 * standard input closes, so it never outlives that program.
 */
async function serve(version: string, io: HostIo): Promise<void> {
  const token = randomLaunchToken();
  const sessions = new SessionTable();
  const bridges = new BridgeTable();
  const server = await startHostServer(token, [
    healthRoute(version),
    ...sandboxRoutes(new SrtSandbox(), sessions),
    ...bridgeRoutes((secrets) => new NodeHarnessBridgeServer({ secrets }), bridges),
  ]);
  const handshake: Handshake = { url: server.url, token };
  io.write(`${JSON.stringify(handshake)}\n`);
  await inputClosed(io.input);
  // Stop the sandboxed programs first, so none outlives the host; their bridges then have no caller.
  await sessions.closeAll();
  await bridges.closeAll();
  await server.close();
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
