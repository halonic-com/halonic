import type { Readable, Writable } from "node:stream";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { NodeHarnessBridgeServer, providerHostClass } from "@halonicjs/adapter-harness-bridge";
import { claudeCodeHarness } from "@halonicjs/adapter-harness-claude-code";
import { codexHarness } from "@halonicjs/adapter-harness-codex";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { createProgramProbe } from "@halonicjs/adapter-sandbox-host";
import {
  keptGrantsRecordFolder,
  SrtSandbox,
  WSL_SHARED_FOLDERS,
} from "@halonicjs/adapter-sandbox-srt";
import type { SandboxChoiceService } from "@halonicjs/app";
import type { GoogleSetupPorts } from "@halonicjs/host-server";
import type { Harness, TrustStore } from "@halonicjs/ports";
import { type ProfileFolder, type ProfilePlatform, trustFolder } from "@halonicjs/profile";
import { BridgeTable, bridgeRoutes } from "./bridge/bridge-routes.ts";
import { bridgeSocketFolder, sweepLeftOverBridges } from "./bridge/socket-folder.ts";
import { hostConnectorRoutes } from "./connector/connector-factory.ts";
import { connectorRoutes } from "./connector/connector-routes.ts";
import { type GatewaySettings, gatewayFor, gatewayOff } from "./gateway/gateway-settings.ts";
import { RemoteGateway } from "./gateway/remote-gateway.ts";
import { RunLedger } from "./gateway/run-ledger.ts";
import { googleRoutes } from "./google/google-routes.ts";
import { openGoogleSetup } from "./google/google-setup.ts";
import { harnessFolders } from "./harness/harness-folders.ts";
import { harnessRoutes } from "./harness/harness-routes.ts";
import { RunTable } from "./harness/run-table.ts";
import { signInRoute } from "./harness/sign-in-route.ts";
import { hostModelRoutes } from "./model/host-model-routes.ts";
import { modelRoutes } from "./model/model-routes.ts";
import { hostPlugins } from "./plugin/host-plugins.ts";
import { pluginRoutes } from "./plugin/plugin-routes.ts";
import { proxySetting } from "./proxy-setting.ts";
import { hostSandboxChoice } from "./sandbox/choice-host.ts";
import { sandboxChoiceRoutes } from "./sandbox/choice-routes.ts";
import { sandboxRoutes } from "./sandbox/sandbox-routes.ts";
import { SessionTable } from "./sandbox/session-table.ts";
import { SetupJobs, setupRoutes } from "./sandbox/setup-routes.ts";
import { sweepRoots, takeHostLock } from "./sandbox/sweep-lock.ts";
import { hostWslRemover, type WslRemover } from "./sandbox/wsl-remove-host.ts";
import { healthRoute } from "./server/health-route.ts";
import { type HostRoute, serveHostOverFrames, startHostServer } from "./server/host-server.ts";
import { randomLaunchToken } from "./server/launch-token.ts";
import { hostIntegrationSignInRoutes } from "./sign-in/host-sign-ins.ts";
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
 * - `--sandbox-setup` sets the sandbox up, for the installer and Studio, with one administrator prompt (see {@link SrtSandbox.setUp}), and prints whether it worked, as JSON: `ok`, or the `outcome` (`cancelled`, `failed`, `check_failed`) and the `reason`;
 * - `--sandbox-remove` removes what the setup left, for the uninstaller and Studio (see {@link SrtSandbox.remove}), and prints whether it worked, as JSON;
 * - `--sandbox-cleanup` removes what sessions added to the user's access lists, for the uninstaller (see {@link SrtSandbox.cleanUp}), and prints whether it worked, as JSON. It reads the profile folder from `--profile-folder`, which the executable passes on;
 * - `--wsl-shared-folders` (with serving) is how Studio's launcher says the host runs in Halonic's WSL distro: every session then denies the distro's shared folders (see {@link WSL_SHARED_FOLDERS}, security review W1);
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
 * The holder also removes, before it serves, the bridges' run folders that a
 * crashed host left in the profile (see {@link sweepLeftOverBridges}).
 *
 * @param makeSandbox - makes the sandbox on this machine with the sweep roots it may sweep and the shared folders its sessions deny; tests make one on a fake machine
 * @param gateway - whether the remote gateway listens; only tests turn it on, because it takes no pairing yet (requirement `agent-host.remote-gateway`). The executable's `main.ts` never passes it.
 * @returns the exit code
 */
export async function run(
  args: readonly string[],
  version: string,
  io: HostIo = standardIo(),
  makeSandbox: (
    sweepRoots: readonly string[],
    sharedFolders: readonly string[],
    recordFolder?: string,
  ) => SrtSandbox = (roots, sharedFolders, recordFolder) =>
    new SrtSandbox(undefined, undefined, null, {
      sweepRoots: roots,
      sharedFolders,
      ...(recordFolder === undefined ? {} : { recordFolder }),
    }),
  gateway: GatewaySettings = gatewayOff,
): Promise<number> {
  if (args.includes("--version")) {
    io.write(`halonic-agent-host ${version}\n`);
    return 0;
  }
  const sandboxExit = sandboxCommand(args, io, makeSandbox);
  if (sandboxExit !== undefined) return await sandboxExit;
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
  const sharedFolders = sharedFoldersOf(args);
  const sandbox = makeSandbox(
    lock === null ? [] : given.roots,
    sharedFolders,
    profileFolder === undefined ? undefined : keptGrantsRecordFolder(profileFolder),
  );
  // Right after the lock is taken, so a host starting next skips its sweep
  // before any session of ours could lose a grant to it.
  if (lock !== null) void sandbox.sweepOnce();
  const socketFolder = bridgeSocketFolder(profileFolder);
  if (lock !== null && socketFolder !== undefined) {
    await sweepLeftOverBridges(socketFolder, (text) => io.writeError(text));
  }
  const places = connectorPlaces(given.roots, profileFolder);
  const host = hostServices(
    version,
    sandbox,
    socketFolder,
    places,
    profileGoogleSetup(profileFolder, places.workspaceRoots),
    optionalProfileOf(profileFolder),
    relayPortForServing(args),
    profileFolder === undefined
      ? undefined
      : hostSandboxChoice(
          { id: sharedFolders.length > 0 ? "srt-wsl" : "srt", sandbox },
          profileFolder,
        ),
    wslRemoverOf(profileFolder, sharedFolders),
    gatewayFor(gateway, args.includes("--stdio"), (text) => io.writeError(text)),
  );
  try {
    if (args.includes("--stdio")) return await serveOverFrames(args, io, host);
    await serve(io, host);
    return 0;
  } finally {
    // After serving: its sessions are closed by then.
    await lock?.release().catch((error: unknown) => {
      io.writeError(`The host lock couldn't be released: ${String(error)}\n`);
    });
  }
}

/** Removes the WSL setup; not served without a profile, nor inside the distro, which has no `wsl.exe`. */
function wslRemoverOf(
  profileFolder: string | undefined,
  sharedFolders: readonly string[],
): WslRemover | undefined {
  if (profileFolder === undefined || sharedFolders.length > 0) return undefined;
  return hostWslRemover(profileFolder);
}

/** The folders every session denies: the WSL distro's shared ones when the launcher says the host runs there. */
function sharedFoldersOf(args: readonly string[]): readonly string[] {
  return args.includes("--wsl-shared-folders") ? WSL_SHARED_FOLDERS : [];
}

/** The relay's port, which only serving over frames uses for the sign-in redirect. */
function relayPortForServing(args: readonly string[]): number | undefined {
  return args.includes("--stdio") ? relayPortOf(args) : undefined;
}

/** Runs the `--sandbox-*` command in the arguments, or returns `undefined` when there is none. */
function sandboxCommand(
  args: readonly string[],
  io: HostIo,
  makeSandbox: (sweepRoots: readonly string[], sharedFolders: readonly string[]) => SrtSandbox,
): Promise<number> | undefined {
  const sandbox = () => makeSandbox([], []);
  if (args.includes("--sandbox-check"))
    return sandbox()
      .check()
      .then((result) => answer(io, result));
  if (args.includes("--sandbox-setup"))
    return sandbox()
      .setUp()
      .then((result) => answer(io, result));
  if (args.includes("--sandbox-remove"))
    return sandbox()
      .remove()
      .then((result) => answer(io, result));
  if (!args.includes("--sandbox-cleanup")) return undefined;
  const profileFolder = argumentAfter(args, "--profile-folder");
  if (profileFolder === undefined) {
    const missing = { ok: false, reason: "--sandbox-cleanup needs --profile-folder." };
    return Promise.resolve(answer(io, missing));
  }
  return sandbox()
    .cleanUp(profileFolder)
    .then((result) => answer(io, result));
}

/**
 * What workspace connectors may use and never reach: Halonic's own profile folder is never a workspace, and is denied.
 * The host checks every connector's trust grant against the trust records of that same folder.
 */
function connectorPlaces(roots: readonly string[], profileFolder: string | undefined) {
  return {
    workspaceRoots: roots.filter((root) => root !== profileFolder),
    deniedPaths: profileFolder === undefined ? [] : [profileFolder],
    trustStore: profileFolder === undefined ? undefined : profileTrustStore(profileFolder),
  };
}

function profileTrustStore(profileFolder: string): TrustStore {
  return new FileTrustStore(trustFolder(profileOf(profileFolder)));
}

/** The Google setup of the profile folder, or `undefined` without one. */
function profileGoogleSetup(
  profileFolder: string | undefined,
  workspaceRoots: readonly string[],
): GoogleSetupPorts | undefined {
  if (profileFolder === undefined) return undefined;
  return openGoogleSetup({ profile: profileOf(profileFolder), env: process.env, workspaceRoots });
}

/** The profile folder `--profile-folder` names, or `undefined` without one. */
function optionalProfileOf(root: string | undefined): ProfileFolder | undefined {
  return root === undefined ? undefined : profileOf(root);
}

/** The profile folder `--profile-folder` names, with the system its path belongs to. */
function profileOf(root: string): ProfileFolder {
  const platforms: Partial<Record<NodeJS.Platform, ProfilePlatform>> = {
    win32: "windows",
    darwin: "macos",
  };
  return { platform: platforms[process.platform] ?? "linux", root };
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
async function serve(io: HostIo, host: HostServices): Promise<void> {
  const token = randomLaunchToken();
  const server = await startHostServer(token, host.routes);
  host.listeningOn(Number(new URL(server.url).port));
  await host.startGateway((text) => io.writeError(text));
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
  io: HostIo,
  host: HostServices,
): Promise<number> {
  const relayPort = relayPortOf(args);
  if (relayPort === undefined) {
    io.writeError("The agent host needs --relay-host 127.0.0.1:<port> with --stdio.\n");
    return 2;
  }
  const output = io.takeOutput();
  const token = randomLaunchToken();
  const handshake: FramedHandshake = { token };
  output.write(`${JSON.stringify(handshake)}\n`);
  host.listeningOn(relayPort);
  await host.startGateway((text) => io.writeError(text));
  const server = serveHostOverFrames(token, host.routes, { input: io.input, output }, relayPort);
  const ended = await server.ended;
  await host.stop();
  await server.close();
  if (ended === undefined) return 0;
  io.writeError(`The agent host stopped: ${ended.message}\n`);
  return 1;
}

/** The port `--relay-host` names, or `undefined` when it is missing or isn't `127.0.0.1:<port>`. */
function relayPortOf(args: readonly string[]): number | undefined {
  const relayHost = args[args.indexOf("--relay-host") + 1] ?? "";
  const port = Number(relayHostPattern.exec(relayHost)?.[1] ?? 0);
  return port === 0 || port > 65_535 ? undefined : port;
}

/** The routes the host serves, and how to stop all they started. */
interface HostServices {
  routes: HostRoute[];
  stop(): Promise<void>;
  /** Tells the host which port its own server listens on, so no provider's address may be that port. */
  listeningOn(port: number): void;
  /**
   * Starts the remote gateway's listener when the setting turns it on, and does nothing otherwise.
   * A listener that can't start is told to `log` and the host serves without it.
   */
  startGateway(log: (text: string) => void): Promise<void>;
}

/**
 * @param socketFolder - where each bridge serves a Unix socket (see {@link bridgeSocketFolder});
 *   `undefined` for bridges on loopback ports
 * @param connectors - the folders the launcher named as workspaces, what a workspace connector's program may never reach, and the trust records it is checked against
 * @param google - the Google setup of the profile, or `undefined` without a profile folder (no Google route is served)
 * @param profile - the profile folder plugins and their trust are read from; `undefined` without one, and then no plugin call is served
 * @param relayPort - the relay's port in `--stdio` mode, which the Google sign-in's redirect names (an integration's sign-in can't start there yet); `undefined` when the host listens on its own port
 * @param choice - the choice service of this host's backend, `undefined` without a profile folder (no choice route is served)
 * @param wslRemover - removes Halonic's WSL distro, `undefined` without a profile folder (no `remove-wsl` route is served)
 * @param gateway - whether and where the remote gateway listens (requirement `agent-host.remote-gateway`)
 */
function hostServices(
  version: string,
  sandbox: SrtSandbox,
  socketFolder: string | undefined,
  connectors: ReturnType<typeof connectorPlaces>,
  google: GoogleSetupPorts | undefined,
  profile: ProfileFolder | undefined,
  relayPort: number | undefined,
  choice: SandboxChoiceService | undefined,
  wslRemover: WslRemover | undefined,
  gateway: GatewaySettings,
): HostServices {
  const sessions = new SessionTable();
  const listeningPorts = new Set<number>();
  const bridges = new BridgeTable();
  const providerHttp = createNodeHttpClient({ hostClass: providerHostClass, proxy: proxySetting });
  const providerFetch = (url: string, init?: RequestInit) => providerHttp.fetch(url, init);
  // Runs are recorded only when the gateway can show them to someone.
  const ledger = gateway.enabled ? new RunLedger() : undefined;
  const runs = new RunTable(ledger);
  const remoteGateway = new RemoteGateway(gateway, ledger, runs);
  const harnesses = hostHarnesses(version);
  const connectorDeps = hostConnectorRoutes(
    { sandbox, version, deniedPaths: connectors.deniedPaths, env: process.env },
    connectors.workspaceRoots,
    connectors.trustStore,
    undefined,
    (text) => process.stderr.write(text),
  );
  const plugins = hostPlugins(version, sandbox, profile);
  const folders = harnessFolders(
    profile,
    connectors.workspaceRoots,
    harnesses,
    bridges,
    logToError,
  );
  const routes = [
    healthRoute(version),
    // A session's temp folder, made with its harness profile, goes when the session closes.
    ...sandboxRoutes(folders.profiles?.removingTempFolders(sandbox) ?? sandbox, sessions),
    ...(choice === undefined ? [] : sandboxChoiceRoutes(choice)),
    ...setupRoutes(new SetupJobs(sandbox, undefined, wslRemover), sessions),
    ...bridgeRoutes(
      (secrets) =>
        new NodeHarnessBridgeServer({
          secrets,
          fetch: providerFetch,
          ...(socketFolder === undefined ? {} : { socketFolder }),
        }),
      bridges,
      ledger === undefined
        ? undefined
        : (runId, agentId) => ({
            asked: (request, decide) => ledger.bridgeApprovalAsked(runId, agentId, request, decide),
            ended: (callId, decision) =>
              ledger.bridgeApprovalEnded(runId, agentId, callId, decision),
          }),
    ),
    ...harnessRoutes({ harnesses, sessions, bridges, runs }),
    ...folders.routes,
    ...connectorRoutes(connectorDeps),
    ...modelRoutes(
      hostModelRoutes({
        workspaceRoots: connectors.workspaceRoots,
        profile,
        env: process.env,
        ownPorts: () => [...listeningPorts, ...bridges.ports()],
        log: logToError,
      }),
    ),
    ...(google === undefined
      ? []
      : googleRoutes({
          google,
          log: (text) => process.stderr.write(text),
          ...(relayPort === undefined ? {} : { relayPort }),
        })),
    ...(plugins === undefined ? [] : pluginRoutes({ plugins: plugins.table, log: logToError })),
    ...hostIntegrationSignInRoutes({
      profile,
      relayPort,
      ownPorts: () => [...listeningPorts, ...bridges.ports()],
      log: logToError,
    }),
    signInRoute({ harnesses, openTerminal: (command) => openTerminal(command) }),
  ];
  const stop = async () => {
    // Close the gateway first, so nothing remote reaches a run that is being stopped.
    await remoteGateway.close();
    // Stop the runs, then their sandboxed programs, so none outlives the host;
    // their bridges then have no caller.
    await runs.cancelAll();
    // A connector closes its own session; then any session left.
    await connectorDeps.connectors.closeAll();
    await plugins?.stop();
    await sessions.closeAll();
    await bridges.closeAll();
    // No program runs any more, so what the runs left can go.
    await folders.stop();
  };
  const startGateway = async (log: (text: string) => void) => {
    const port = await remoteGateway.start(log);
    if (port !== undefined) listeningPorts.add(port);
  };
  return { routes, stop, startGateway, listeningOn: (port) => listeningPorts.add(port) };
}

function logToError(text: string): void {
  process.stderr.write(text);
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
