import type { Readable, Writable } from "node:stream";
import { NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";
import { resolveRealPath } from "@halonicjs/adapter-harness-kit";
import {
  keptGrantsRecordFolder,
  removalAfterHelper,
  removalBeforeHelper,
  SrtSandbox,
  setupAfterHelper,
} from "@halonicjs/adapter-sandbox-srt";
import type { SandboxChoiceService } from "@halonicjs/app";
import type { GoogleSetupPorts } from "@halonicjs/host-server";
import type { ProfileFolder } from "@halonicjs/profile";
import { BridgeTable, bridgeRoutes } from "./bridge/bridge-routes.ts";
import { bridgeProviderFetches } from "./bridge/provider-fetches.ts";
import {
  bridgeSocketFolder,
  socketFolderFor,
  sweepLeftOverBridges,
} from "./bridge/socket-folder.ts";
import { serveAgentHostCodingTools } from "./coding-tools-mode.ts";
import { hostConnectorRoutes } from "./connector/connector-factory.ts";
import { connectorRoutes } from "./connector/connector-routes.ts";
import { ConnectorTable } from "./connector/connector-table.ts";
import { hostDoctorRoutes } from "./doctor/host-doctor-routes.ts";
import { engineCommand } from "./engine/engine-command.ts";
import { RunLedger } from "./gateway/run-ledger.ts";
import { googleRoutes } from "./google/google-routes.ts";
import { harnessFolders } from "./harness/harness-folders.ts";
import { harnessRoutes } from "./harness/harness-routes.ts";
import { hostProgramCopies } from "./harness/host-program-copies.ts";
import { programCopyRoutes } from "./harness/program-copy-routes.ts";
import { RunTable } from "./harness/run-table.ts";
import { signInRoute } from "./harness/sign-in-route.ts";
import {
  argumentAfter,
  connectorPlaces,
  hostHarnesses,
  hostSecretsOf,
  logToError,
  sharedFoldersOf,
  shellChannelOf,
  wslRemoverOf,
} from "./host-parts.ts";
import { stopHost } from "./host-stop.ts";
import { hostMessaging } from "./messaging/host-messaging.ts";
import { messagingOnlyArgument, serveMessagingOnly } from "./messaging-only.ts";
import { hostModelRoutes } from "./model/host-model-routes.ts";
import { modelRoutes } from "./model/model-routes.ts";
import { hostPluginRoutes, hostPlugins } from "./plugin/host-plugins.ts";
import { optionalProfileOf, profileGoogleSetup } from "./profile-folder.ts";
import { proxySetting } from "./proxy-setting.ts";
import {
  openHostRemote,
  type RemoteOffer,
  remoteHomeFor,
  type ServedRemoteHome,
} from "./remote/host-remote.ts";
import { remoteRoutes } from "./remote/remote-routes.ts";
import { noBuiltProfiles } from "./sandbox/built-profiles.ts";
import { hostSandboxChoice } from "./sandbox/choice-host.ts";
import { sandboxChoiceRoutes } from "./sandbox/choice-routes.ts";
import { removeThroughShellRoutes } from "./sandbox/remove-through-shell-routes.ts";
import { sandboxCommand } from "./sandbox/sandbox-commands.ts";
import { sandboxRoutes } from "./sandbox/sandbox-routes.ts";
import { SessionTable } from "./sandbox/session-table.ts";
import { SetupJobs, setupRoutes } from "./sandbox/setup-routes.ts";
import { sweepRoots, takeHostLock } from "./sandbox/sweep-lock.ts";
import type { WslRemover } from "./sandbox/wsl-remove-host.ts";
import { hostKeychainOf } from "./secrets/host-keychain.ts";
import { healthRoute } from "./server/health-route.ts";
import { type HostServices, relayPortForServing, serveHost } from "./serving-modes.ts";
import { hostIntegrationSignIns } from "./sign-in/host-sign-ins.ts";
import { takeStandardOutput } from "./stdio/standard-output.ts";
import { openTerminal } from "./terminal/open-terminal.ts";
import { hostThisComputer } from "./this-computer/host-this-computer.ts";
import { thisComputerRoutes } from "./this-computer/this-computer-routes.ts";
import { UnfencedSessions } from "./this-computer/unfenced-sessions.ts";

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
 * - `--sandbox-take-back` takes back the grants a removal with administrator rights kept, for the installer, which runs it as the person installing before its sandbox step (see {@link SrtSandbox.takeBack}), and prints what it did, as JSON: `ok` and the `outcome` (`taken_back`, `none`, `elevated`, `failed`);
 * - `--sandbox-cleanup` removes what sessions added to the user's access lists, for the uninstaller (see {@link SrtSandbox.cleanUp}), and prints whether it worked, as JSON. It reads the profile folder from `--profile-folder`, which the executable passes on;
 * - `--sandbox-setting-copy` saves the sandbox choice on standard input in the profile, and `--sandbox-setting-remove` removes it: Studio's shell keeps the copy in Halonic's WSL distro equal to the choice on Windows (see {@link copySandboxSetting}). Both print whether it worked, as JSON;
 * - `--wsl-setup` sets up Halonic's WSL distro from the Windows side, for Studio's shell, with the image (`--wsl-image`) and the `RunOnce` command (`--wsl-resume`) the shell gives, and leaves the runtime to the shell (see `wslSetupCommand` in `sandbox/wsl-setup-command.ts`). It prints the setup's result as JSON and exits with 0 only when it is `done`;
 * - `--wsl-shared-folders` (with serving) is how Studio's launcher says the host runs in Halonic's WSL distro: every session then denies the distro's shared folders (see `WSL_SHARED_FOLDERS`, security review W1);
 * - `--keychain-relay` (with serving) is how Studio says it keeps the host's own secrets in the OS keychain and answers for them on connection id 0 (see {@link hostKeychainOf});
 * - `--engine --profile-folder <folder> --workspace <folder>` runs the workspace's engine for Studio's shell (see {@link engineCommand});
 * - `--messaging-only` serves agent messaging and Paperclip's sign-in only (see {@link serveMessagingOnly});
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
 * @param remote - the tunnel provider that lets the host offer remote, and run the remote gateway while remote is on (requirement `agent-host.remote-gateway`). The executable's `main.ts` passes none until phase C brings the real providers, so it offers no remote.
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
  remote?: RemoteOffer,
): Promise<number> {
  if (args.includes("--version")) {
    io.write(`halonic-agent-host ${version}\n`);
    return 0;
  }
  const commandExit = roleCommand(args, version, io, () => makeSandbox([], []));
  if (commandExit !== undefined) return await commandExit;
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
  const channel = shellChannelOf(keychain, places.workspaceRoots, profileFolder, (text) =>
    io.writeError(text),
  );
  const serving = { overStdio: args.includes("--stdio"), profile, holdsLock: lock !== null };
  const home = remoteHomeFor(remote, serving, (text) => io.writeError(text));
  const host = await hostServices(
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
    home === undefined
      ? undefined
      : {
          ...home,
          secrets: hostSecretsOf(keychain, home.profile),
          log: (text) => io.writeError(text),
        },
    sharedFolders.length > 0,
  );
  // Waits for the frame stream to run; a move that fails has said why, and is tried again on use.
  keychain?.secrets.moveOutOfFile().catch(() => undefined);
  try {
    return await serveHost(args, io, host, channel);
  } finally {
    // After serving: its sessions are closed by then.
    await lock?.release().catch((error: unknown) => {
      io.writeError(`The host lock couldn't be released: ${String(error)}\n`);
    });
  }
}

/** The `coding-tools` mode, which `main.ts` runs from the payload it checked (`coding-tools-mode.ts`). */
export const serveCodingTools = serveAgentHostCodingTools;

/** The engine role, a sandbox command or messaging-only serving, when `args` ask for one; `undefined` when the full host serves. */
function roleCommand(
  args: readonly string[],
  version: string,
  io: HostIo,
  sandbox: () => SrtSandbox,
) {
  const profileFolder = argumentAfter(args, "--profile-folder");
  if (args.includes(messagingOnlyArgument)) return serveMessagingOnly(args, version, io);
  return engineCommand(args, version, io) ?? sandboxCommand(args, profileFolder, io, sandbox);
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
 * @param remote - where the host offers remote, with the store of its host key; `undefined` when it offers none
 * @param onWsl - whether the host runs inside Halonic's WSL distro (`--wsl-shared-folders`), for the doctor's drive warning
 */
async function hostServices(
  version: string,
  sandbox: SrtSandbox,
  socketFolder: string | undefined,
  connectors: ReturnType<typeof connectorPlaces>,
  google: GoogleSetupPorts | undefined,
  profile: ProfileFolder | undefined,
  relayPort: number | undefined,
  choice: SandboxChoiceService | undefined,
  wslRemover: WslRemover | undefined,
  remote: ServedRemoteHome | undefined,
  onWsl: boolean,
): Promise<HostServices> {
  const sessions = new SessionTable();
  // The sessions opened without the sandbox, whose runs start only with the host's environment.
  const unfenced = new UnfencedSessions(sessions);
  const listeningPorts = new Set<number>();
  const bridges = new BridgeTable();
  // The ports the host and its bridges listen on, which no outbound call may reach.
  const ownPorts = () => [...listeningPorts, ...bridges.ports()];
  const providerFetches = bridgeProviderFetches(ownPorts, proxySetting);
  // Runs are recorded only when the gateway can show them to someone.
  const ledger = remote === undefined ? undefined : new RunLedger();
  const runs = new RunTable(ledger);
  const hostRemote = await openHostRemote(
    remote === undefined || ledger === undefined
      ? undefined
      : { ...remote, ledger, runs, ownPorts: listeningPorts },
  );
  const harnesses = hostHarnesses(version);
  const connectorTable = new ConnectorTable();
  // A workspace's connectors stop before its program copies are swept.
  const programCopies = hostProgramCopies(
    profile,
    connectors.workspaceRoots,
    (workspace) => connectorTable.closeWorkspace(workspace),
    logToError,
  );
  const connectorDeps = {
    ...hostConnectorRoutes(
      { sandbox, version, deniedPaths: connectors.deniedPaths, env: process.env },
      connectors.workspaceRoots,
      connectors.trustStore,
      connectorTable,
      logToError,
    ),
    ...(programCopies === undefined ? {} : { programCopies }),
  };
  // A plugin's backend places the tokens of its sign-ins, and the sign-ins read
  // the plugin's sheet: each looks the other up only when it is used.
  const signIns = hostIntegrationSignIns({
    profile,
    relayPort,
    integration: (name) => plugins?.signIns(name),
    ownPorts,
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
  const messaging = hostMessaging(profile, connectors.workspaceRoots, logToError);
  const routes = [
    healthRoute(version),
    // A session's temp folder, made with its harness profile, goes when the session closes.
    // Sessions open only for the profiles the host built for Studio's harness runs.
    ...sandboxRoutes(
      folders.profiles?.removingTempFolders(sandbox) ?? sandbox,
      sessions,
      folders.profiles ?? noBuiltProfiles,
    ),
    ...(choice === undefined ? [] : sandboxChoiceRoutes(choice)),
    ...setupRoutes(setupJobs, sessions),
    ...removeThroughShellRoutes(setupJobs, sessions, {
      before: () => removalBeforeHelper(),
      after: (exitCode) => removalAfterHelper(exitCode),
    }),
    ...bridgeRoutes(
      (secrets, runsOn) => {
        const runFolder = socketFolderFor(runsOn, socketFolder);
        return new NodeHarnessBridgeServer({
          secrets,
          fetch: providerFetches.fetch,
          compatibleFetch: providerFetches.compatibleFetch,
          ...(runFolder === undefined ? {} : { socketFolder: runFolder }),
        });
      },
      bridges,
      ledger === undefined
        ? undefined
        : (runId, agentId) => ({
            asked: (request, decide) => ledger.bridgeApprovalAsked(runId, agentId, request, decide),
            ended: (callId, decision) =>
              ledger.bridgeApprovalEnded(runId, agentId, callId, decision),
          }),
      // An agent with `asks: in-sandbox` runs its calls in its working folder without asking, fenced (HAL-15287).
      { resolve: resolveRealPath, windows: process.platform === "win32" },
    ),
    // An agent a person set to "On this computer" runs without the sandbox, past the host's own gate.
    ...thisComputerRoutes(
      hostThisComputer({
        profile,
        profiles: folders.profiles,
        instructions: folders.instructions,
        proposals: folders.proposals,
        workspaceRoots: connectors.workspaceRoots,
        trustStore: connectors.trustStore,
        platform: process.platform,
      }),
      sessions,
      unfenced,
    ),
    ...harnessRoutes({ harnesses, sessions, bridges, runs, unfenced }),
    ...folders.routes,
    ...connectorRoutes(connectorDeps),
    ...(programCopies === undefined ? [] : programCopyRoutes(programCopies)),
    ...modelRoutes(
      hostModelRoutes({
        workspaceRoots: connectors.workspaceRoots,
        profile,
        trustStore: connectors.trustStore,
        env: process.env,
        ownPorts,
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
    ...messaging.routes,
    ...signIns.routes,
    signInRoute({ harnesses, openTerminal: (command) => openTerminal(command) }),
    ...hostDoctorRoutes({
      version,
      profile,
      trustStore: connectors.trustStore,
      workspaceRoots: connectors.workspaceRoots,
      sandbox,
      harnesses,
      onWsl,
      ownPorts: () => [...listeningPorts, ...bridges.ports()],
      log: logToError,
    }),
    ...remoteRoutes(hostRemote.control),
  ];
  const stop = async () => {
    await messaging.stop();
    await stopHost({
      remote: hostRemote,
      runs,
      connectors: connectorTable,
      plugins,
      sessions,
      programCopies,
      bridges,
      folders,
    });
  };
  return { routes, stop, listeningOn: (port) => listeningPorts.add(port) };
}
