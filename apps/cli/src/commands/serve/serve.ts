// `halonic serve [--network] [--port]`: opens the workspace to a phone or
// browser through the secure server (`@halonicjs/host-server`), until Ctrl C
// or SIGTERM (HAL-195 PR 9b-2). A thin command, modelled on `routines watch`:
// it checks trust, opens the local engine, and plugs the engine, the
// on-disk request count and the sign-in password hash into the server and
// its Node listener.
//
// It starts only in a workspace that is trusted here. The server asks the
// read-only trust gate again before every request that starts a run, so an
// edit after this check stops the runs until a person trusts it again with
// `halonic trust`. Later versions are checked as `routines watch` checks them.

import { access, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makePrivateFolder } from "@halonicjs/adapter-fs-node";
import { createScryptHasher } from "@halonicjs/adapter-password-scrypt";
import { createServer, passwordSecretName, type ServerPorts } from "@halonicjs/host-server";
import type { PasswordHasher, TrustGrant } from "@halonicjs/ports";
import { profileFolder, workspaceFolders } from "@halonicjs/profile";
import { routineKey } from "@halonicjs/routines";
import { KindedError, randomIds } from "@halonicjs/std";
import {
  type Listening,
  listenOnNode,
  NetworkNeedsPasswordError,
  NoNetworkAddressError,
  openDiskRequestCountStore,
  openStudioPageFolder,
} from "@halonicjs/target-node-runtime";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type StoppedResult,
  UsageError,
} from "../../command.ts";
import type { RoutineEngine } from "../../local-engine-host.ts";
import { serveMessages } from "../../messages/serve.ts";
import { printable } from "../../output/printable.ts";
import { unsandboxedWarning } from "../../sandbox-gate.ts";
import { workspaceTrustGate } from "../../serve-trust-gate.ts";
import { halonicVersion } from "../../version.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { checkEngineRuns, openWorkspaceEngine } from "../../workspace-engine.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "../../workspace-runs.ts";
import { trustedGrant, workspaceNameOf } from "../../workspace-trust.ts";
import { type VersionChecks, WatchedVersions } from "../routines/watch-versions.ts";
import type { RunSetup } from "../run/run.ts";
import { startsOnLiveVersion } from "./live-version-runs.ts";
import { workspaceModelSettings } from "./model-settings-gate.ts";

/** What `serve` uses on this computer, so tests can fix the password hasher and the network. */
export interface ServeSetup extends RunSetup {
  /** Hashes and checks the sign-in password; scrypt by default. */
  readonly hasher?: PasswordHasher;
  /** Where the built Studio page is; `apps/studio/dist/studio` next to this command by default. */
  readonly studioFolder?: string;
}

/**
 * The Studio page as `pnpm --filter @halonicjs/app-studio build` leaves it.
 * `serve` reads it where it is and keeps no copy, so there is no build step
 * in this package: the page is built where it lives, and `serve` serves what
 * is there.
 */
const builtStudioFolder = fileURLToPath(new URL("../../../../studio/dist/studio", import.meta.url));

/** The port when `--port` isn't given. */
export const defaultPort = 4747;

/** The most bytes a request body may have: a run's input, never a file. */
const maxBodyBytes = 1024 * 1024;

/**
 * Serves the workspace until Ctrl C or SIGTERM, then returns that it
 * stopped: exit 130 or 143.
 *
 * @throws UsageError when `--port` isn't a port number
 * @throws NoWorkspaceError when the folder holds no workspace
 * @throws HistoryUnavailableError when the workspace has history but git
 *   can't start; nothing was served (exit 9)
 * @throws OwnLineError `conflict` when the workspace has history but nothing
 *   is live yet; nothing was served
 * @throws NotTrustedError when the workspace isn't trusted here, or changed
 *   since; nothing was served (exit 3)
 * @throws NetworkNeedsPasswordError when `--network` is given and no sign-in password is set
 * @throws NoNetworkAddressError when `--network` is given and the computer has no network address
 * @throws KindedError `conflict` when another engine is open on the workspace
 */
export async function serveWorkspace(
  input: CommandInput,
  context: CommandContext,
  setup: ServeSetup,
): Promise<StoppedResult> {
  const port = portOf(input);
  const network = input.options["network"] === true;
  const dir = await openWorkspaceDir(input, context);
  const versions = await WatchedVersions.open(dir, setup.history);
  try {
    return await serveVersions(input, context, setup, dir, versions, { port, network });
  } finally {
    // After the engine has closed: no run starts from a version any more.
    await versions.close();
  }
}

/** `--port` as a number: 0 to 65535, or the default. */
function portOf(input: CommandInput): number {
  const given = input.options["port"];
  if (given === undefined) return defaultPort;
  if (typeof given !== "string" || !/^[0-9]{1,5}$/u.test(given) || Number(given) > 65535) {
    throw new UsageError(serveMessages.portInvalid());
  }
  return Number(given);
}

async function serveVersions(
  input: CommandInput,
  context: CommandContext,
  setup: ServeSetup,
  dir: OpenWorkspaceDir,
  versions: WatchedVersions,
  listen: { readonly port: number; readonly network: boolean },
): Promise<StoppedResult> {
  const workspace = versions.latest();
  const typedDir = givenDir(input, dir);
  const trusted = (loaded: LoadedWorkspace): Promise<TrustGrant> =>
    trustedGrant(dir, setup.trust(), typedDir, serveMessages.nothingServed(), loaded);
  // Before anything opens: a workspace that isn't trusted here serves nothing.
  const grant = await trusted(workspace);
  const warned = new Set<string>();
  versions.checkWith({
    trust: trusted,
    sandbox: async (loaded, run) => {
      const agents = await checkEngineRuns(setup, {
        dir,
        workspace: loaded,
        runs: [run],
        ending: serveMessages.runNotStarted(),
      });
      for (const agent of agents) {
        if (warned.has(agent.name)) continue;
        warned.add(agent.name);
        context.printAhead(unsandboxedWarning(agent));
      }
    },
  } satisfies VersionChecks);

  const engine = await openWorkspaceEngine(context, setup, {
    dir,
    workspace,
    versions,
    trust: grant,
    // Each served run is checked as it starts, in `versions`; none is known before.
    runs: [],
    ending: serveMessages.nothingServed(),
  });
  try {
    // The server takes the engine's own parts, the ones a webhook starts runs with. The webhook
    // routines are read live from `versions`; none runs on a clock.
    const server = await listenOnComputer(context, setup, dir, versions, engine, listen);
    try {
      const name = printable(workspaceNameOf(workspace, dir));
      context.printAhead(serveMessages.serving(name, `http://localhost:${server.port}`).phrase);
      if (!(await passwordIsSet(context))) context.printAhead(serveMessages.noPassword().phrase);
      if (!(await isBuilt(studioFolderOf(setup)))) {
        context.printAhead(serveMessages.studioNotBuilt().phrase);
      }
      await stopped(engine.signal);
    } finally {
      await server.close();
    }
  } finally {
    await engine.close();
  }
  if (engine.stuck.aborted) throw engine.stuck.reason;
  return { stopped: true, json: {} };
}

function studioFolderOf(setup: ServeSetup): string {
  return setup.studioFolder ?? builtStudioFolder;
}

/** Whether the Studio page's entry is there to serve. */
async function isBuilt(studioFolder: string): Promise<boolean> {
  return access(join(studioFolder, "studio.html")).then(
    () => true,
    () => false,
  );
}

async function passwordIsSet(context: CommandContext): Promise<boolean> {
  return (await context.secrets.get(passwordSecretName)) !== null;
}

async function listenOnComputer(
  context: CommandContext,
  setup: ServeSetup,
  dir: OpenWorkspaceDir,
  versions: WatchedVersions,
  parts: RoutineEngine,
  listen: { readonly port: number; readonly network: boolean },
): Promise<Listening> {
  const folders = await workspaceFolders(
    profileFolder(setup.profile ?? nodeProfileEnvironment()),
    await realpath(dir.root),
    webCryptoDigest,
  );
  // A failure the caller isn't told about: the cause goes to `--debug`.
  const logRequestFailure = (error: unknown): void =>
    context.debug(
      serveMessages.requestFailed(printable(error instanceof Error ? error.message : String(error)))
        .phrase,
    );
  const countFolder = join(folders.folder, "serve-requests");
  await makePrivateFolder(countFolder);
  const ports: ServerPorts = {
    runs: startsOnLiveVersion(parts.executor, () => versions.routines.runVersion()),
    runStore: parts.runs,
    secrets: context.secrets,
    passwordHasher: setup.hasher ?? createScryptHasher(),
    coordination: parts.coordination,
    trust: workspaceTrustGate(dir, setup.trust()),
    modelSettings: workspaceModelSettings(() => versions.latest()),
    webhooks: {
      find: async (key) =>
        (await versions.routines.list()).find((placed) => routineKey(placed) === key) ?? null,
    },
    studioPage: openStudioPageFolder(studioFolderOf(setup)),
    requestCounts: openDiskRequestCountStore(countFolder, parts.clock),
    errorLog: { record: logRequestFailure },
    clock: parts.clock,
    ids: randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), parts.clock),
  };
  const listening = listenOnNode({
    createServer: (allowedHosts) =>
      createServer({
        config: {
          deploymentId: "local",
          version: halonicVersion,
          minAppVersion: halonicVersion,
          allowedHosts,
          maxBodyBytes,
        },
        ports,
      }),
    port: listen.port,
    network: listen.network,
    passwordIsSet: await passwordIsSet(context),
    report: (line) => context.printAhead(serveMessages.address(printable(line)).phrase),
    logError: logRequestFailure,
  });
  return await listening.catch((error: unknown) => {
    // The runtime's own sentences say what to do, so they reach the person as they are.
    if (error instanceof NetworkNeedsPasswordError) {
      throw new KindedError("invalid_input", error.message, { cause: error });
    }
    if (error instanceof NoNetworkAddressError) {
      throw new KindedError("unavailable", error.message, { cause: error });
    }
    throw error;
  });
}

/** Resolves once `signal` is aborted: at Ctrl C or SIGTERM, or when three ticks or wake-ups in a row fail. */
function stopped(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}
