import type { Readable, Writable } from "node:stream";
import { NodeHarnessBridgeServer, providerHostClass } from "@halonicjs/adapter-harness-bridge";
import { claudeCodeHarness } from "@halonicjs/adapter-harness-claude-code";
import { codexHarness } from "@halonicjs/adapter-harness-codex";
import { connectorHostClass } from "@halonicjs/adapter-http-kit";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { createProgramProbe } from "@halonicjs/adapter-sandbox-host";
import {
  keptGrantsRecordFolder,
  removalAfterHelper,
  removalBeforeHelper,
  SrtSandbox,
  setupAfterHelper,
  WSL_SHARED_FOLDERS,
} from "@halonicjs/adapter-sandbox-srt";
import type { SandboxChoiceService } from "@halonicjs/app";
import type { GoogleSetupPorts } from "@halonicjs/host-server";
import type { Harness } from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { BridgeTable, bridgeRoutes } from "./bridge/bridge-routes.ts";
import { bridgeSocketFolder, sweepLeftOverBridges } from "./bridge/socket-folder.ts";
import { hostConnectorRoutes } from "./connector/connector-factory.ts";
import { connectorRoutes } from "./connector/connector-routes.ts";
import { type GatewaySettings, gatewayFor, gatewayOff } from "./gateway/gateway-settings.ts";
import { RemoteGateway } from "./gateway/remote-gateway.ts";
import { RunLedger } from "./gateway/run-ledger.ts";
import { googleRoutes } from "./google/google-routes.ts";
import { harnessFolders } from "./harness/harness-folders.ts";
import { harnessRoutes } from "./harness/harness-routes.ts";
import { RunTable } from "./harness/run-table.ts";
import { signInRoute } from "./harness/sign-in-route.ts";
import { hostModelRoutes } from "./model/host-model-routes.ts";
import { modelRoutes } from "./model/model-routes.ts";
import { hostPluginRoutes, hostPlugins } from "./plugin/host-plugins.ts";
import { optionalProfileOf, profileGoogleSetup, profileTrustStore } from "./profile-folder.ts";
import { proxySetting } from "./proxy-setting.ts";
import { hostSandboxChoice } from "./sandbox/choice-host.ts";
import { sandboxChoiceRoutes } from "./sandbox/choice-routes.ts";
import { removeThroughShellRoutes } from "./sandbox/remove-through-shell-routes.ts";
import { sandboxCommand } from "./sandbox/sandbox-commands.ts";
import { sandboxRoutes } from "./sandbox/sandbox-routes.ts";
import { SessionTable } from "./sandbox/session-table.ts";
import { SetupJobs, setupRoutes } from "./sandbox/setup-routes.ts";
import { sweepRoots, takeHostLock } from "./sandbox/sweep-lock.ts";
import { hostWslRemover, type WslRemover } from "./sandbox/wsl-remove-host.ts";
import { hostKeychainOf } from "./secrets/host-keychain.ts";
import { healthRoute } from "./server/health-route.ts";
import { type HostServices, relayPortOf, serveHost } from "./serving-modes.ts";
import { hostIntegrationSignIns } from "./sign-in/host-sign-ins.ts";
import { takeStandardOutput } from "./stdio/standard-output.ts";
import { openTerminal } from "./terminal/open-terminal.ts";

/** What a serving host's sandbox gets from the profile: the kept-grant record, and whether it takes back what a removal with administrator rights left (HAL-5404 S2). */
export interface ProfileSandbox {
  recordFolder?: string;
  takeBackOrphaned?: boolean;
}

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

/**
 * The agent host, as the executable loads it from the unpacked payload.
 *
 * - `--version` prints its version;
 * - `--sandbox-check` prints whether the sandbox works on this machine, as JSON;
 * - `--sandbox-setup` sets the sandbox up, for the installer and Studio, with one administrator prompt (see {@link SrtSandbox.setUp}), and prints whether it worked, as JSON: `ok`, or the `outcome` (`cancelled`, `failed`, `check_failed`) and the `reason`;
 * - `--sandbox-remove` removes what the setup left, for the uninstaller and Studio (see {@link SrtSandbox.remove}), and prints whether it worked, as JSON;
 * - `--sandbox-cleanup` removes what sessions added to the user's access lists, for the uninstaller (see {@link SrtSandbox.cleanUp}), and prints whether it worked, as JSON. It reads the profile folder from `--profile-folder`, which the executable passes on;
 * - `--sandbox-setting-copy` saves the sandbox choice on standard input in the profile, and `--sandbox-setting-remove` removes it: Studio's shell keeps the copy in Halonic's WSL distro equal to the choice on Windows (see {@link copySandboxSetting}). Both print whether it worked, as JSON;
 * - `--wsl-shared-folders` (with serving) is how Studio's launcher says the host runs in Halonic's WSL distro: every session then denies the distro's shared folders (see {@link WSL_SHARED_FOLDERS}, security review W1);
 * - `--keychain-relay` (with serving) is how Studio says it keeps the host's own secrets in the OS keychain and answers for them on connection id 0 (see {@link hostKeychainOf});
 * - `--stdio --relay-host 127.0.0.1:<port>` serves over standard input and output (see `serveOverFrames` in `serving-modes.ts`);
 * - otherwise it serves on loopback (see `serveOnLoopback` in `serving-modes.ts`).
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
    inProfile?: ProfileSandbox,
  ) => SrtSandbox = (roots, sharedFolders, inProfile = {}) =>
    new SrtSandbox(undefined, undefined, null, {
      sweepRoots: roots,
      sharedFolders,
      ...inProfile,
    }),
  gateway: GatewaySettings = gatewayOff,
): Promise<number> {
  if (args.includes("--version")) {
    io.write(`halonic-agent-host ${version}\n`);
    return 0;
  }
  const sandboxExit = sandboxCommand(args, argumentAfter(args, "--profile-folder"), io, () =>
    makeSandbox([], []),
  );
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
  const sandbox = makeSandbox(lock === null ? [] : given.roots, sharedFolders, {
    ...(profileFolder === undefined ? {} : { recordFolder: keptGrantsRecordFolder(profileFolder) }),
    // Only the lock's holder: it alone sweeps, before its first session.
    ...(lock === null ? {} : { takeBackOrphaned: true }),
  });
  // Right after the lock is taken, so a host starting next skips its sweep
  // before any session of ours could lose a grant to it.
  if (lock !== null) void sandbox.sweepOnce();
  const socketFolder = bridgeSocketFolder(profileFolder);
  if (lock !== null && socketFolder !== undefined) {
    await sweepLeftOverBridges(socketFolder, (text) => io.writeError(text));
  }
  const places = connectorPlaces(given.roots, profileFolder);
  const profile = optionalProfileOf(profileFolder);
  const keychain = hostKeychainOf(args, profile, (text) => io.writeError(text));
  const host = hostServices(
    version,
    sandbox,
    socketFolder,
    places,
    profileGoogleSetup(profileFolder, places.workspaceRoots),
    profile,
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
  // Waits for the frame stream to run; a move that fails has said why, and is tried again on use.
  keychain?.secrets.moveOutOfFile().catch(() => undefined);
  try {
    return await serveHost(args, io, host, keychain?.channel);
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

/** The value after `name` in `args`, when there is one. */
function argumentAfter(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

/**
 * @param socketFolder - where each bridge serves a Unix socket (see {@link bridgeSocketFolder});
 *   `undefined` for bridges on loopback ports
 * @param connectors - the folders the launcher named as workspaces, what a workspace connector's program may never reach, and the trust records it is checked against
 * @param google - the Google setup of the profile, or `undefined` without a profile folder (no Google route is served)
 * @param profile - the profile folder plugins and their trust are read from; `undefined` without one, and then no plugin call is served
 * @param relayPort - the relay's port in `--stdio` mode, which the redirect of a Google or an integration's sign-in names; `undefined` when the host listens on its own port
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
  // A compatible provider's own `baseUrl` is checked as a connector's address
  // is, as in the CLI's bridge, so a name can't lead the key onto the person's
  // own network (HAL-13798).
  const compatibleHttp = createNodeHttpClient({
    hostClass: connectorHostClass,
    proxy: proxySetting,
  });
  const compatibleFetch = (url: string, init?: RequestInit) => compatibleHttp.fetch(url, init);
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
  // A plugin's backend places the tokens of its sign-ins, and the sign-ins read
  // the plugin's sheet: each looks the other up only when it is used.
  const signIns = hostIntegrationSignIns({
    profile,
    relayPort,
    integration: (name) => plugins?.signIns(name),
    ownPorts: () => [...listeningPorts, ...bridges.ports()],
    log: logToError,
  });
  const plugins = hostPlugins(
    version,
    sandbox,
    profile,
    (plugin) => signIns.host?.integration(plugin)?.signIns.tokens,
  );
  const folders = harnessFolders(
    profile,
    connectors.workspaceRoots,
    harnesses,
    bridges,
    logToError,
  );
  const setupJobs = new SetupJobs(sandbox, undefined, wslRemover, (exitCode) =>
    setupAfterHelper(exitCode, () => sandbox.check()),
  );
  const routes = [
    healthRoute(version),
    // A session's temp folder, made with its harness profile, goes when the session closes.
    ...sandboxRoutes(folders.profiles?.removingTempFolders(sandbox) ?? sandbox, sessions),
    ...(choice === undefined ? [] : sandboxChoiceRoutes(choice)),
    ...setupRoutes(setupJobs, sessions),
    ...removeThroughShellRoutes(setupJobs, sessions, {
      before: () => removalBeforeHelper(),
      after: removalAfterHelper,
    }),
    ...bridgeRoutes(
      (secrets) =>
        new NodeHarnessBridgeServer({
          secrets,
          fetch: providerFetch,
          compatibleFetch,
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
        trustStore: connectors.trustStore,
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
    ...hostPluginRoutes(plugins, logToError),
    ...signIns.routes,
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
