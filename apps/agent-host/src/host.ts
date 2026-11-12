import type { Readable, Writable } from "node:stream";
import { NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";
import { claudeCodeHarness } from "@halonicjs/adapter-harness-claude-code";
import { codexHarness } from "@halonicjs/adapter-harness-codex";
import { createProgramProbe } from "@halonicjs/adapter-sandbox-host";
import { type SandboxSetup, SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { Harness } from "@halonicjs/ports";
import { BridgeTable, bridgeRoutes } from "./bridge/bridge-routes.ts";
import { harnessRoutes } from "./harness/harness-routes.ts";
import { RunTable } from "./harness/run-table.ts";
import { signInRoute } from "./harness/sign-in-route.ts";
import { sandboxRoutes } from "./sandbox/sandbox-routes.ts";
import { SessionTable } from "./sandbox/session-table.ts";
import { sweepRoots, takeHostLock } from "./sandbox/sweep-lock.ts";
import { healthRoute } from "./server/health-route.ts";
import { type HostRoute, serveHostOverFrames, startHostServer } from "./server/host-server.ts";
import { randomLaunchToken } from "./server/launch-token.ts";
import { takeStandardOutput } from "./stdio/standard-output.ts";
import { openTerminal } from "./terminal/open-terminal.ts";

/** Where the host talks to the program that started it. */
export interface HostIo {
  /** The starter's end of the pipe: when it closes, the host stops. */
  input: Readable;
  /** Writes to standard output. */
  write(text: string): void;
  /** Writes to standard error, for a person to read. */
  writeError(text: string): void;
  /**
   * Takes standard output over for the frames of `--stdio` mode: from then
   * on, `write` and anything else that prints go to standard error.
   */
  takeOutput(): Writable;
}

/** The host's own standard input, output and error. */
function standardIo(): HostIo {
  return {
    input: process.stdin,
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
    takeOutput: () => takeStandardOutput(),
  };
}

/** The first line the host prints when it serves: where it listens, and its token. */
export interface Handshake {
  url: string;
  token: string;
}

/** The first line in `--stdio` mode: only the token, as Studio's relay has the address. */
export type FramedHandshake = Pick<Handshake, "token">;

/** What `--relay-host` may name: the relay's port on Windows' own loopback address. */
const relayHostPattern = /^127\.0\.0\.1:([1-9][0-9]{0,4})$/;

/**
 * The agent host, as the executable loads it from the unpacked payload.
 *
 * - `--version` prints its version;
 * - `--sandbox-check` prints whether the sandbox works on this machine, as JSON;
 * - `--sandbox-setup` sets the sandbox up, once, for the installer (see {@link SrtSandbox.setUp}), and prints whether it worked, as JSON;
 * - `--sandbox-remove` removes what the setup left, for the uninstaller (see {@link SrtSandbox.remove}), and prints whether it worked, as JSON;
 * - `--sandbox-cleanup` removes what sessions added to the user's access lists, for the uninstaller (see {@link SrtSandbox.cleanUp}), and prints whether it worked, as JSON. It reads the profile folder from `--profile-folder`, which the executable passes on;
 * - `--stdio --relay-host 127.0.0.1:<port>` serves over standard input and output (see {@link serveOverFrames});
 * - otherwise it serves on loopback (see {@link serve}).
 *
 * The sandbox commands exit with 0 when the answer is `ok`, and 1 when it
 * isn't, so the installer needn't read the JSON.
 *
 * When it serves, the host takes the profile's lock (`--profile-folder`, which
 * the executable passes on). If it gets it, it sweeps the kept Windows grants
 * inside each `--sweep-root` the launcher gives (see {@link SrtSandbox.sweepOnce});
 * while another live host holds the lock, it serves without a sweep (HAL-6256).
 *
 * @param makeSandbox - makes the sandbox on this machine with the sweep roots it may sweep; tests make one on a fake machine
 * @returns the exit code
 */
export async function run(
  args: readonly string[],
  version: string,
  io: HostIo = standardIo(),
  makeSandbox: (sweepRoots: readonly string[]) => SrtSandbox = (roots) =>
    new SrtSandbox(undefined, undefined, null, { sweepRoots: roots }),
): Promise<number> {
  if (args.includes("--version")) {
    io.write(`halonic-agent-host ${version}\n`);
    return 0;
  }
  if (args.includes("--sandbox-check")) {
    return answer(io, await makeSandbox([]).check());
  }
  if (args.includes("--sandbox-setup")) {
    return answer(io, await makeSandbox([]).setUp());
  }
  if (args.includes("--sandbox-remove")) {
    return answer(io, await makeSandbox([]).remove());
  }
  if (args.includes("--sandbox-cleanup")) {
    const profileFolder = argumentAfter(args, "--profile-folder");
    if (profileFolder === undefined) {
      const missing: SandboxSetup = {
        ok: false,
        reason: "--sandbox-cleanup needs --profile-folder.",
      };
      return answer(io, missing);
    }
    return answer(io, await makeSandbox([]).cleanUp(profileFolder));
  }
  const given = sweepRoots(args);
  if ("error" in given) {
    io.writeError(given.error);
    return 2;
  }
  const profileFolder = argumentAfter(args, "--profile-folder");
  // Says why it doesn't sweep only when it was asked to.
  const warn = (text: string) => {
    if (given.roots.length > 0) io.writeError(text);
  };
  const lock = profileFolder === undefined ? null : await takeHostLock(profileFolder, warn);
  const sandbox = makeSandbox(lock === null ? [] : given.roots);
  // Right after the lock is taken, so a host starting next skips its sweep
  // before any session of ours could lose a grant to it.
  if (lock !== null) void sandbox.sweepOnce();
  try {
    if (args.includes("--stdio")) return await serveOverFrames(args, version, io, sandbox);
    await serve(version, io, sandbox);
    return 0;
  } finally {
    // After serving: its sessions are closed by then.
    await lock?.release().catch((error: unknown) => {
      io.writeError(`The host lock couldn't be released: ${String(error)}\n`);
    });
  }
}

/** The value after `name` in `args`, when there is one. */
function argumentAfter(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
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
  const host = hostServices(version, sandbox);
  const server = await startHostServer(token, host.routes);
  const handshake: Handshake = { url: server.url, token };
  io.write(`${JSON.stringify(handshake)}\n`);
  await inputClosed(io.input);
  await host.stop();
  await server.close();
}

/**
 * Serves the same routes as {@link serve}, but on no port at all: in WSL,
 * every distro of a person shares one network, so a port in Halonic's distro
 * would be open to their other distros too (HAL-5396). Studio starts the host
 * through `wsl.exe` and relays the connections it accepts on Windows' loopback
 * as frames over the host's standard input and output (see `demuxFrames`).
 *
 * The handshake is one {@link FramedHandshake} line; after it, standard output
 * carries frames only. Requests must name the relay's address
 * (`--relay-host`) in their `Host` header. The host stops when the frame
 * stream ends: at the end of its input, as in the other mode, or when the
 * stream breaks the format.
 *
 * @returns the exit code: 0 at the end of the input, 1 when the stream broke, 2 for a wrong `--relay-host`
 */
async function serveOverFrames(
  args: readonly string[],
  version: string,
  io: HostIo,
  sandbox: SrtSandbox,
): Promise<number> {
  const relayHost = args[args.indexOf("--relay-host") + 1] ?? "";
  const relayPort = Number(relayHostPattern.exec(relayHost)?.[1] ?? 0);
  if (relayPort === 0 || relayPort > 65_535) {
    io.writeError("The agent host needs --relay-host 127.0.0.1:<port> with --stdio.\n");
    return 2;
  }
  const output = io.takeOutput();
  const token = randomLaunchToken();
  const host = hostServices(version, sandbox);
  const handshake: FramedHandshake = { token };
  output.write(`${JSON.stringify(handshake)}\n`);
  const server = serveHostOverFrames(token, host.routes, { input: io.input, output }, relayPort);
  const ended = await server.ended;
  await host.stop();
  await server.close();
  if (ended === undefined) return 0;
  io.writeError(`The agent host stopped: ${ended.message}\n`);
  return 1;
}

/** The routes the host serves, and how to stop all they started. */
function hostServices(
  version: string,
  sandbox: SrtSandbox,
): { routes: HostRoute[]; stop(): Promise<void> } {
  const sessions = new SessionTable();
  const bridges = new BridgeTable();
  const runs = new RunTable();
  const harnesses = hostHarnesses(version);
  const routes = [
    healthRoute(version),
    ...sandboxRoutes(sandbox, sessions),
    ...bridgeRoutes((secrets) => new NodeHarnessBridgeServer({ secrets }), bridges),
    ...harnessRoutes({ harnesses, sessions, bridges, runs }),
    signInRoute({ harnesses, openTerminal: (command) => openTerminal(command) }),
  ];
  const stop = async () => {
    // Stop the runs, then their sandboxed programs, so none outlives the host;
    // their bridges then have no caller.
    await runs.cancelAll();
    await sessions.closeAll();
    await bridges.closeAll();
  };
  return { routes, stop };
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
