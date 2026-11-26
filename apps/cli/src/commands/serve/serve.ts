// `halonic serve [--network | --public-origin] [--port]`: opens the workspace to a phone or
// browser through the secure server (`@halonicjs/host-server`), until Ctrl C
// or SIGTERM (HAL-195 PR 9b-2). A thin command, modelled on `routines watch`:
// it checks trust, opens the local engine, and plugs the engine, the
// on-disk request count and the sign-in password hash into the server and
// its Node listener.
//
// It starts only in a workspace that is trusted here, or that reaches only
// the test model and needs no trust. The server asks the
// read-only trust gate again before every request that starts a run, so an
// edit after this check stops the runs until a person trusts it again with
// `halonic trust`. Later versions are checked as `routines watch` checks them.
// The routines on a clock run as `routines watch` runs them (`server.routines`).

import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { makePrivateFolder } from "@halonicjs/adapter-fs-node";
import { createScryptHasher } from "@halonicjs/adapter-password-scrypt";
import { workspaceModelSettings } from "@halonicjs/adapter-workspace-models";
import type { RoutineEngine } from "@halonicjs/engine";
import {
  createServer,
  isHttpsOrigin,
  passwordSecretName,
  providerKeysOf,
  type ServerPorts,
} from "@halonicjs/host-server";
import type { PasswordHasher, TrustGrant } from "@halonicjs/ports";
import { profileFolder, workspaceFolders } from "@halonicjs/profile";
import { routineKey } from "@halonicjs/routines";
import { KindedError, randomIds } from "@halonicjs/std";
import {
  type Listening,
  listenOnNode,
  openDiskRequestCountStore,
  openStudioPageFolder,
} from "@halonicjs/target-node-runtime";
import {
  type CommandContext,
  type CommandInput,
  type StoppedResult,
  UsageError,
} from "../../command.ts";
import { engineHttp } from "../../engine-http.ts";
import { openGoogleHost } from "../../google-host.ts";
import { type Phrase, plainText } from "../../messages/phrase.ts";
import { serveMessages } from "../../messages/serve.ts";
import { inNpmPackage } from "../../npm-package.ts";
import { printable } from "../../output/printable.ts";
import { placedWarning } from "../../sandbox-gate.ts";
import { openSecretStore } from "../../secret-host.ts";
import { workspaceTrustGate } from "../../serve-trust-gate.ts";
import { halonicVersion } from "../../version.ts";
import type { WorkspaceAtVersion } from "../../workspace-at-version.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { checkEngineRuns, openWorkspaceEngine } from "../../workspace-engine.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "../../workspace-runs.ts";
import { needsNoTrust, trustedGrant, workspaceNameOf } from "../../workspace-trust.ts";
import { type VersionChecks, WatchedVersions } from "../routines/watch-versions.ts";
import type { RunSetup } from "../run/run.ts";
import { workspaceAgentNames } from "./agent-names.ts";
import { openChoiceHistory } from "./choice-files.ts";
import { workspaceGoogleRead } from "./google-read.ts";
import { listenRefused } from "./listen-refusal.ts";
import { startsOnLiveVersion } from "./live-version-runs.ts";
import {
  answerBrowserWithoutStudio,
  reachableFromPhone,
  studioPageIsBuilt,
} from "./no-studio-page.ts";
import { serveRequestLog } from "./request-log.ts";
import { type ConsoleTransport, openServeConsole, type ServeConsole } from "./serve-console.ts";
import { openServePaperclip } from "./serve-paperclip.ts";
import { ServePaperclipTools } from "./serve-paperclip-tools.ts";
import { type ServedRoutines, servedRoutines } from "./serve-routines.ts";
import { servedRuleIsolate } from "./serve-rules.ts";
import { servedModelChoice } from "./served-model-choice.ts";
import { studioPageIsOutdated } from "./studio-page-age.ts";
import { studioPlacesFor } from "./studio-places.ts";
import { reportWebhookRefusals } from "./webhook-refusals.ts";
import { webhookRoutineLines } from "./webhook-routines.ts";
import { servedWorkspaceFacts } from "./workspace-facts.ts";

/** What `serve` uses on this computer, so tests can fix the password hasher and the network. */
export interface ServeSetup extends RunSetup {
  /** Hashes and checks the sign-in password; scrypt by default. */
  readonly hasher?: PasswordHasher;
  /**
   * Where the built Studio page is, or null for none; by default `apps/studio/dist/studio` next to
   * this command, and none in the npm package.
   */
  readonly studioFolder?: string | null;
  /**
   * The Studio app the page is built from, to tell an outdated page; `apps/studio` next to this
   * command by default, and none when only `studioFolder` is given.
   */
  readonly studioApp?: string;
  /** How `serve` offers its console to `serve pair` and `serve devices`; the Unix socket by default. */
  readonly console?: ConsoleTransport;
  /** The `fetch` the Paperclip providers and the `paperclip` connector send with; the global one by default. */
  readonly paperclipFetch?: typeof fetch;
}

const defaultStudioPlaces = studioPlacesFor(inNpmPackage, import.meta.url);

/** The port when `--port` isn't given. */
export const defaultPort = 4747;

/** The most bytes a request body may have: a run's input, never a file. */
const maxBodyBytes = 1024 * 1024;

/**
 * Serves the workspace until Ctrl C or SIGTERM, then returns that it
 * stopped: exit 130 or 143.
 *
 * @throws UsageError when `--port` isn't a port number, or `--public-origin` isn't an https
 *   origin or comes with `--network`
 * @throws NoWorkspaceError when the folder holds no workspace
 * @throws HistoryUnavailableError when the workspace has history but git
 *   can't start; nothing was served (exit 9)
 * @throws OwnLineError `conflict` when the workspace has history but nothing
 *   is live yet; nothing was served
 * @throws NotTrustedError when the workspace isn't trusted here, or changed
 *   since; nothing was served (exit 3)
 * @throws NetworkNeedsPasswordError when `--network` is given and no sign-in password is set
 * @throws NoNetworkAddressError when `--network` is given and the computer has no network address
 * @throws KindedError `invalid_input` when `--public-origin` is given and no sign-in password is set
 * @throws KindedError `invalid_input` when a Paperclip key is stored for one of the workspace's
 *   connections and no sign-in password is set
 * @throws KindedError `conflict` when another engine is open on the workspace,
 *   or another program listens on the port
 */
export async function serveWorkspace(
  input: CommandInput,
  context: CommandContext,
  setup: ServeSetup,
): Promise<StoppedResult> {
  const port = portOf(input);
  const network = input.options["network"] === true;
  const publicOrigin = publicOriginOf(input, network);
  const dir = await openWorkspaceDir(input, context);
  const versions = await WatchedVersions.open(dir, setup.history);
  try {
    const listen = { port, network, ...(publicOrigin === undefined ? {} : { publicOrigin }) };
    return await serveVersions(input, context, setup, dir, versions, listen);
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

/** `--public-origin` when given: an https origin, never with `--network`. */
function publicOriginOf(input: CommandInput, network: boolean): string | undefined {
  const given = input.options["public-origin"];
  if (given === undefined) return undefined;
  if (typeof given !== "string" || !isHttpsOrigin(given)) {
    throw new UsageError(serveMessages.publicOriginInvalid());
  }
  if (network) throw new UsageError(serveMessages.publicOriginWithNetwork());
  return given;
}

/** Where `serve` listens: the port, and the network or a public origin besides this computer. */
interface ListenChoice {
  readonly port: number;
  readonly network: boolean;
  readonly publicOrigin?: string;
}

async function serveVersions(
  input: CommandInput,
  context: CommandContext,
  setup: ServeSetup,
  dir: OpenWorkspaceDir,
  versions: WatchedVersions,
  listen: ListenChoice,
): Promise<StoppedResult> {
  const workspace = versions.latest();
  const typedDir = givenDir(input, dir);
  // No grant for a workspace that reaches only the test model, as `run` has none (HAL-12011).
  const trusted = async (version: WorkspaceAtVersion): Promise<TrustGrant | null> =>
    needsNoTrust(version)
      ? null
      : await trustedGrant(dir, setup.trust(), typedDir, serveMessages.nothingServed(), version);
  // Before anything opens: a workspace that needs trust and isn't trusted here serves nothing.
  const first = versions.latestVersion();
  const grant = await trusted(first);
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
        // By its place too: an agent confirmed again after its ! line on hold gets its new line.
        const key = `${agent.kind} ${agent.name}`;
        if (warned.has(key)) continue;
        warned.add(key);
        context.printAhead(placedWarning(agent));
      }
    },
  } satisfies VersionChecks);

  // The port the server takes, then the one it got: a run's bridge never calls it (HAL-15251).
  let servePort = listen.port;
  const routines = await servedRoutines(context, setup, dir, typedDir, workspace, versions);
  // A served run's tool steps reach Paperclip only through the stored key (HAL-19721).
  const paperclipTools = new ServePaperclipTools({
    workspace: await realpath(dir.root),
    keys: openSecretStore(setup.profile ?? nodeProfileEnvironment()),
    ...(setup.paperclipFetch === undefined ? {} : { fetch: setup.paperclipFetch }),
  });
  const engine = await openWorkspaceEngine(context, setup, {
    holder: "serve",
    dir,
    workspace,
    integrations: first.integrations,
    versions,
    trust: grant,
    // The routines' workflows, as `routines watch` checks them; every served run is also checked
    // as it starts, in `versions`.
    runs: routines.runs,
    ending: serveMessages.nothingServed(),
    ownPorts: () => [servePort],
    routines: (parts) => routines.ticks(parts),
    builtInConnectors: [paperclipTools],
    ...servedRuleIsolate(inNpmPackage),
  });
  try {
    // The server takes the engine's own parts, the ones a webhook starts runs with. The webhook
    // routines are read live from `versions`; those on a clock run on the engine's tick.
    const server = await listenOnComputer(context, setup, dir, versions, engine, {
      ...listen,
      routines,
    });
    servePort = server.port;
    try {
      // The console for `serve pair` and `serve devices`, over the engine's own coordination;
      // open before the "Serving" line, so both commands work once it shows.
      const deviceConsole = await openServeConsole(context, setup, dir, engine);
      try {
        await printServing(context, setup, versions, deviceConsole, {
          name: printable(workspaceNameOf(workspace, dir)),
          address: listen.publicOrigin ?? `http://localhost:${server.port}`,
          reachable: reachableFromPhone(listen),
        });
        await stopped(engine.signal);
      } finally {
        await deviceConsole.close();
      }
    } finally {
      await server.close();
    }
  } finally {
    await engine.close();
  }
  if (engine.stuck.aborted) throw engine.stuck.reason;
  return { stopped: true, json: {} };
}

/** The "Serving" line and the lines under it, and on stderr why the console didn't open. */
async function printServing(
  context: CommandContext,
  setup: ServeSetup,
  versions: WatchedVersions,
  deviceConsole: ServeConsole,
  served: { readonly name: string; readonly address: string; readonly reachable: boolean },
): Promise<void> {
  context.printAhead(serveMessages.serving(served.name, served.address).phrase);
  if (!(await passwordIsSet(context))) context.printAhead(serveMessages.noPassword().phrase);
  if (deviceConsole.warning !== null) context.warn(deviceConsole.warning);
  const studioLine = await studioPageLine(setup, served.reachable);
  if (studioLine !== null) context.printAhead(studioLine);
  // Each webhook routine's address, so a routine that never starts says why (HAL-14299).
  const loaded = await versions.routines.listLoaded();
  for (const line of await webhookRoutineLines(loaded, context.secrets, served.address)) {
    context.printAhead(line);
  }
}

function studioFolderOf(setup: ServeSetup): string | null {
  return setup.studioFolder === undefined
    ? (defaultStudioPlaces?.page ?? null)
    : setup.studioFolder;
}

/** The line under the "Serving" line about the Studio page, or null when the page is there and current. */
async function studioPageLine(setup: ServeSetup, reachable: boolean): Promise<Phrase | null> {
  const studioFolder = studioFolderOf(setup);
  if (studioFolder === null) return serveMessages.studioNotInPackage(reachable).phrase;
  if (!(await studioPageIsBuilt(studioFolder))) return serveMessages.studioNotBuilt().phrase;
  if (await isOutdated(setup, studioFolder)) return serveMessages.studioOutdated().phrase;
  return null;
}

/** Whether the built page is older than the app it is built from, such as after a `git pull`. */
async function isOutdated(setup: ServeSetup, studioFolder: string): Promise<boolean> {
  const app =
    setup.studioApp ?? (setup.studioFolder === undefined ? defaultStudioPlaces?.app : undefined);
  return app !== undefined && (await studioPageIsOutdated(studioFolder, app));
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
  listen: ListenChoice & { readonly routines: ServedRoutines },
): Promise<Listening> {
  const environment = setup.profile ?? nodeProfileEnvironment();
  const root = await realpath(dir.root);
  // Resolved like `root`, so a link or a short Windows name can't hide that the workspace is under home.
  const home = await realpath(environment.homeFolder).catch(() => environment.homeFolder);
  const folders = await workspaceFolders(profileFolder(environment), root, webCryptoDigest);
  // A failure the caller isn't told about: the cause goes to `--debug`.
  const logRequestFailure = (error: unknown): void =>
    context.debug(
      serveMessages.requestFailed(printable(error instanceof Error ? error.message : String(error)))
        .phrase,
    );
  const findWebhookRoutine = async (key: string) =>
    (await versions.routines.list()).find((placed) => routineKey(placed) === key) ?? null;
  const countFolder = join(folders.folder, "serve-requests");
  await makePrivateFolder(countFolder);
  // The version served runs start from, as `halonic trust` reviews it.
  const trust = workspaceTrustGate(dir, setup.trust(), () => versions.liveVersion());
  const keys = openSecretStore(environment);
  // The profile's secrets file only, never the environment: no unit, image or CI holds the key.
  const paperclip = await openServePaperclip({
    workspace: root,
    keys,
    profileFolder: folders.folder,
    log: logRequestFailure,
    clock: parts.clock,
    ...(setup.paperclipFetch === undefined ? {} : { fetch: setup.paperclipFetch }),
  });
  // With no password, everyone who reaches the port would act with the board's key.
  if (paperclip.connected.length > 0 && !(await passwordIsSet(context))) {
    const message = plainText(serveMessages.paperclipNeedsPassword().phrase);
    throw new KindedError("invalid_input", message);
  }
  const studioFolder = studioFolderOf(setup);
  const ports: ServerPorts = {
    runs: startsOnLiveVersion(parts.executor, () => versions.routines.runVersion()),
    runStore: parts.runs,
    secrets: context.secrets,
    providerKeys: providerKeysOf(keys),
    // Both need a signed-in session, and `serve` is one owner's: a many-user server mounts neither.
    messaging: paperclip.messaging,
    paperclipKeys: paperclip.signIn,
    // Pick a model in a served window: saves the key and commits the choice, never trust (HAL-14808).
    modelChoice: servedModelChoice({
      files: { store: dir.store, root, openHistory: openChoiceHistory },
      keys,
      secrets: context.secrets,
      trust,
      http: engineHttp(),
      digest: webCryptoDigest,
    }),
    passwordHasher: setup.hasher ?? createScryptHasher(),
    coordination: parts.coordination,
    trust,
    modelSettings: workspaceModelSettings(() => versions.trustedLive()),
    // Read only: a served window shows the Google setups, and its sign-in is finished on this computer (HAL-10697).
    googleRead: workspaceGoogleRead({
      setups: openGoogleHost({ profile: environment, clock: parts.clock }).setups,
      workspaceKey: folders.key,
      root,
      workspace: () => versions.live(),
    }),
    webhooks: { find: findWebhookRoutine },
    routineSchedule: listen.routines.schedule,
    workspace: {
      // Both read at every request, from the live version as it is now: a rename shows once
      // it is committed, before a run starts from that commit.
      describe: servedWorkspaceFacts({
        workspace: () => versions.live(),
        dir,
        folder: root,
        home,
      }),
      agentNames: workspaceAgentNames(() => versions.live()),
    },
    // With no page, `/` answers 404 and the API is served as usual.
    ...(studioFolder === null ? {} : { studioPage: openStudioPageFolder(studioFolder) }),
    requestCounts: openDiskRequestCountStore(countFolder, parts.clock),
    errorLog: { record: logRequestFailure },
    requestLog: serveRequestLog(context),
    clock: parts.clock,
    ids: randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), parts.clock),
  };
  const listening = listenOnNode({
    createServer: (allowedHosts) =>
      // A refused webhook delivery gets a line, so the terminal says why it started nothing (HAL-15084).
      reportWebhookRefusals(
        answerBrowserWithoutStudio(
          createServer({
            config: {
              deploymentId: "local",
              version: halonicVersion,
              minAppVersion: halonicVersion,
              allowedHosts,
              maxBodyBytes,
              ...(listen.publicOrigin === undefined ? {} : { publicOrigin: listen.publicOrigin }),
            },
            ports,
          }),
          studioFolder === null,
          reachableFromPhone(listen),
        ),
        {
          routineName: async (key) => (await findWebhookRoutine(key))?.routine.name ?? null,
          print: (line) => context.printAhead(line),
          debugging: context.debugging === true,
        },
      ),
    port: listen.port,
    network: listen.network,
    ...(listen.publicOrigin === undefined ? {} : { publicOrigin: listen.publicOrigin }),
    passwordIsSet: await passwordIsSet(context),
    report: (line) => context.printAhead(serveMessages.address(printable(line)).phrase),
    logError: logRequestFailure,
  });
  const server = await listening.catch((error: unknown) => listenRefused(error, listen.port));
  return paperclip.pollWhile(server);
}

/** Resolves once `signal` is aborted: at Ctrl C or SIGTERM, or when three ticks or wake-ups in a row fail. */
function stopped(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}
