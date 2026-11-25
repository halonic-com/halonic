// The engine role's Node parts (B1, HAL-17051): the workspace engine that
// `halonic routines watch` and `halonic serve` open, on the versions they
// watch, with the harness host of `target-node-harness`, the routine
// scheduler, and the engine server behind `listenForEngine`. What differs
// from the CLI: secrets and key origins come only from Studio's shell over
// the control pipe; trust is only read, through the moved gate (HAL-17049);
// and the hub's connectors and the listed tools stay off until the engine
// role gets the shell's approvals (no `runConnectors`, no listed-tool
// approvals), which fails safe: a run calls no connector.
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { nodeCommandSearch } from "@halonicjs/adapter-doctor-node";
import { FolderDefinitionStore, FolderRunStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { connectorHostClass } from "@halonicjs/adapter-http-kit";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import {
  type EnginePlace,
  type LocalEngine,
  type OpenedHistory,
  openLocalEngine,
  type TrustReadMachine,
  type VersionChecks,
  WatchedVersions,
  webCryptoDigest,
  workspaceTrustGate,
  workspaceTrustState,
} from "@halonicjs/adapter-workspace-engine-node";
import { workspaceModelSettings } from "@halonicjs/adapter-workspace-models";
import { workspaceRoutineScheduler } from "@halonicjs/app";
import { endStoppedRuns, noListedToolApproval } from "@halonicjs/engine";
import { createEngineServer, type EngineServerPorts } from "@halonicjs/host-server";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { DEFAULT_TICK_POLICY } from "@halonicjs/routines";
import { systemClock } from "@halonicjs/std";
import { openLocalHarnessHost } from "@halonicjs/target-node-harness";
import { filesOf } from "@halonicjs/workspace";
import { agentHostCodingToolsServer } from "../coding-tools-mode.ts";
import { profileOf, profileTrustStore } from "../profile-folder.ts";
import { proxySetting } from "../proxy-setting.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { BrokerSecrets } from "./broker-secrets.ts";
import type { ControlPipe } from "./control-pipe.ts";
import type { EngineArguments } from "./engine-arguments.ts";
import { type EngineListener, listenForEngine } from "./engine-listener.ts";
import type { EngineRoleParts, RunningEngine } from "./engine-role.ts";
import { engineTrustSentences } from "./engine-trust-sentences.ts";
import { nextRoutineAt } from "./next-routine.ts";
import { runUpdatesFeed } from "./run-updates-feed.ts";
import { EngineSchedule, runningEngine } from "./running-engine.ts";

/** What the engine lock names its holder by, so a refused `halonic run` can say who holds it. */
const engineHolder = "Studio's background engine";

/** The workspace folder the engine reads, as the watched versions and the trust gate take it. */
interface EngineFolder {
  readonly root: string;
  readonly shown: string;
  readonly name: string;
  readonly store: FolderDefinitionStore;
}

/** The engine role's parts, and whether its stop gave the lock up while a step still ran. */
export interface EngineCommandParts extends EngineRoleParts {
  /** `true` once the stop gave `engine.lock` up past the grace time: the process must end then. */
  abandoned(): boolean;
}

/** The engine role's parts on this computer, for `runEngineRole`. */
export function engineRoleParts(
  args: EngineArguments,
  version: string,
  writeError: (text: string) => void,
): EngineCommandParts {
  let abandoned = false;
  const onAbandoned = () => {
    abandoned = true;
  };
  return {
    open: (pipe) => openEngine(args, version, pipe, { writeError, onAbandoned }),
    every,
    writeError,
    abandoned: () => abandoned,
  };
}

/** Runs `tick` every `ms` milliseconds, until the returned function is called. */
function every(tick: () => void, ms: number): () => void {
  const timer = setInterval(tick, ms);
  return () => clearInterval(timer);
}

/** Resolves after `ms` milliseconds, or at once, with the timer cleared, when `cancel` aborts. */
function waitUnless(ms: number, cancel: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    cancel.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Opens the engine: reads the workspace's versions, takes `engine.lock`,
 * then listens. Whatever opened before a failure is closed again.
 */
async function openEngine(
  args: EngineArguments,
  version: string,
  pipe: ControlPipe,
  report: { writeError(text: string): void; onAbandoned(): void },
): Promise<RunningEngine> {
  const { writeError, onAbandoned } = report;
  const profile = profileOf(args.profileFolder);
  // Only the profile folder the shell named: never `HALONIC_HOME` from the environment.
  const environment: ProfileEnvironment = {
    platform: profile.platform,
    homeFolder: homedir(),
    variables: { HALONIC_HOME: args.profileFolder },
  };
  const root = await realpath(args.workspace);
  const dir: EngineFolder = {
    root,
    shown: root,
    name: basename(root),
    // Fenced off the profile folder, as the CLI's store is.
    store: new FolderDefinitionStore(root, root, { fence: profile.root }),
  };
  const versions = await WatchedVersions.open(dir, openGitHistory);
  // A scheduler's timer is no name: it reads as the scheduler's.
  const reportError = (error: unknown, source: unknown) =>
    writeError(
      `The engine hit an error (${typeof source === "string" ? source : "scheduler"}): ${messageOf(error)}\n`,
    );
  const machine: TrustReadMachine = {
    trustStore: profileTrustStore(args.profileFolder),
    clock: systemClock,
    commandSearch: nodeCommandSearch(),
  };
  const schedule = new EngineSchedule();
  let local: LocalEngine | undefined;
  let listener: EngineListener | undefined;
  try {
    versions.checkWith(engineVersionChecks(dir, machine));
    const first = await workspaceTrustState(dir, machine, async () => versions.latestVersion());
    const secrets = new BrokerSecrets((kind, name) => pipe.ask(kind, name));
    let ownPort: number | undefined;
    local = await openLocalEngine({
      workspace: versions.latest(),
      versions,
      workspaceRoot: root,
      environment,
      secrets,
      keyOrigins: secrets,
      http: createNodeHttpClient({ hostClass: connectorHostClass, proxy: proxySetting }),
      trusted: first.state === "trusted",
      holder: engineHolder,
      openHarnessHost: (place) =>
        harnessHostAt(
          place,
          { version, versions, secrets, trusted: first.state === "trusted" },
          {
            ownPorts: () => (ownPort === undefined ? [] : [ownPort]),
            reportError,
          },
        ),
      listedToolApproval: () => noListedToolApproval,
      reportError,
      routines: (engine) => {
        const workspaceId = filesOf(versions.latest(), "workspace")[0]?.value.id ?? dir.name;
        const { clock, coordination } = engine;
        const scheduler = workspaceRoutineScheduler({
          workspaceId,
          clock,
          coordination,
          executor: engine.executor,
          runs: engine.runs,
          routines: () => versions.routines.list(),
          targetUnavailable: (run) => versions.routines.targetUnavailable(run),
          runVersion: () => versions.routines.runVersion(),
          policy: { ...DEFAULT_TICK_POLICY, timeZone: computerTimeZone() },
        });
        return schedule.ticks(scheduler, {
          countRuns: async () => {
            const going = await engine.runs.list({ status: ["running", "waiting"] });
            const waiting = going.filter((run) => run.status === "waiting").length;
            return { active: going.length, waiting };
          },
          nextRoutineAt: async (at) =>
            nextRoutineAt(await versions.routines.list(), new Date(at), computerTimeZone()),
        });
      },
    });
    const opened = local;
    const token = randomLaunchToken();
    const ports: EngineServerPorts = {
      runs: opened.executor,
      runStore: opened.runs,
      trust: workspaceTrustGate(dir, machine, () => versions.liveVersion(), engineTrustSentences),
      modelSettings: workspaceModelSettings(() => versions.trustedLive()),
      errorLog: { record: (error) => reportError(error, "engine-server") },
      clock: opened.clock,
      routines: { list: () => versions.routines.list(), timeZone: computerTimeZone() },
      runUpdates: runUpdatesFeed({
        runs: opened.runs,
        every,
        reportError: (error) => reportError(error, "run-updates"),
      }),
    };
    listener = await listenForEngine(
      (port, maxBodyBytes) => createEngineServer({ launchToken: token, port, maxBodyBytes, ports }),
      { reportError: (error) => reportError(error, "engine-listener") },
    );
    ownPort = Number(new URL(listener.url).port);
    return runningEngine({
      url: listener.url,
      token,
      engine: closingVersionsWith(opened, versions),
      schedule,
      listener,
      wait: waitUnless,
      reportError: (error) => reportError(error, "engine-lock"),
      onAbandoned,
      endStoppedRuns: async (store, clock, cause) =>
        (await endStoppedRuns(store, clock, cause)).interrupted.length,
    });
  } catch (error) {
    await listener?.close().catch((closeError) => reportError(closeError, "engine-listener"));
    await local?.close().catch((closeError) => reportError(closeError, "engine-lock"));
    await versions.close().catch((closeError) => reportError(closeError, "history"));
    throw error;
  }
}

/**
 * The checks each later version passes before a run starts from it: trust
 * only, read and never granted. A trusted version gives no grant, so no
 * integration's declared tools are taken from it, as there are no connectors.
 */
function engineVersionChecks(dir: EngineFolder, machine: TrustReadMachine): VersionChecks {
  return {
    trust: async (version) => {
      const { state } = await workspaceTrustState(dir, machine, async () => version);
      if (state === "trusted" || state === "not-needed") return null;
      throw new Error(engineTrustSentences[state]());
    },
    // The harness host checks an agent's placement as each harness step starts.
    sandbox: async () => {},
  };
}

/** The harness host for the engine at `place`, as the CLI's `cliHarnessHost` opens it. */
function harnessHostAt(
  place: EnginePlace,
  engine: {
    readonly version: string;
    readonly versions: WatchedVersions;
    readonly secrets: BrokerSecrets;
    readonly trusted: boolean;
  },
  report: {
    readonly ownPorts: () => Iterable<number>;
    reportError(error: unknown, source: string): void;
  },
) {
  const { location, folders, profile, environment } = place;
  const codingTools = agentHostCodingToolsServer(profile.root);
  return openLocalHarnessHost({
    halonicVersion: engine.version,
    ...(codingTools === undefined ? {} : { codingTools }),
    location,
    folders,
    profile,
    environment,
    workspace: () => engine.versions.latest(),
    versions: engine.versions,
    store: new FolderDefinitionStore(location, location, { fence: profile.root }),
    digest: webCryptoDigest,
    clock: systemClock,
    openRuns: async () => {
      const open = await new FolderRunStore(folders.runsFolder()).list({
        status: ["running", "waiting"],
      });
      return new Set(open.map((run) => run.id));
    },
    reportError: (error) => report.reportError(error, "harness-host"),
    reportBridgeError: (error) => report.reportError(error, "harness-bridge"),
    reportHostLock: (error) => report.reportError(error, "host-lock"),
    secrets: engine.secrets,
    keyOrigins: engine.secrets,
    trusted: engine.trusted,
    ownPorts: report.ownPorts,
  });
}

/** `engine`, whose close also closes the versions' history, once, after the engine. */
function closingVersionsWith(engine: LocalEngine, versions: WatchedVersions): LocalEngine {
  let closed: Promise<void> | undefined;
  const closeVersions = () => {
    closed ??= versions.close();
    return closed;
  };
  return {
    ...engine,
    close: async () => {
      await engine.close();
      await closeVersions();
    },
    abandon: async () => {
      await engine.abandon();
      await closeVersions();
    },
  };
}

/** The workspace's git history, read only, or `null` when the folder isn't a repository. */
async function openGitHistory(root: string): Promise<OpenedHistory | null> {
  const isRepository = await realpath(join(root, ".git")).then(
    () => true,
    () => false,
  );
  if (!isRepository) return null;
  const runner = await GitRunner.create();
  // The engine only reads the history, so it never commits as this author.
  const vcs = new GitVcs(root, { runner, author: { name: "Halonic", email: "halonic@localhost" } });
  return { vcs, close: () => runner.close() };
}

/** The zone a routine's schedule runs in when it names none: this computer's. */
function computerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
