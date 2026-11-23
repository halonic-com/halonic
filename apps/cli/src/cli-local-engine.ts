// The engine for one workspace on this computer, as `halonic run` starts it
// (HAL-3814): the shared engine (`@halonicjs/adapter-workspace-engine-node`)
// with the CLI's own parts (HAL-14217). Those are what only the CLI says or
// starts: the lock's refusal in the CLI's words, the next step a refused
// send names, the profile check of `HALONIC_HOME`, the listed tools'
// approvals given with `halonic tools`,
// and the harness host (`openLocalHarnessHost`, HAL-7747), which runs an
// agent in a harness, in a worktree of its own in the profile, and keeps
// what the run changed as a proposal there, which `halonic proposals`
// reviews (HAL-6477). `halonic routines watch` still refuses a harness
// agent. Sending is off for every connector unless a person switched it on
// with `halonic google allow-sending`.

import {
  FileToolApprovalStore,
  FileTrustStore,
  FolderRunStore,
  LockHeldError,
} from "@halonicjs/adapter-fs-node";
import {
  type EnginePlace,
  type LocalEngine,
  type LocalRunConnectorsInput,
  type OpenEngineHarnessHost,
  type OpenLocalEngineInput,
  openLocalEngine as openSharedEngine,
} from "@halonicjs/adapter-workspace-engine-node";
import type { ChatTurnWaiting, RunStore } from "@halonicjs/ports";
import { type ProfileEnvironment, toolApprovalFolder, trustFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { LoadedWorkspace, LocalIntegrationInput } from "@halonicjs/workspace";
import { approvedIntegrations } from "./approved-integrations.ts";
import { cliListedToolApproval } from "./cli-listed-tool-approval.ts";
import { type EngineHolder, engineHolders, engineLockRefusal } from "./engine-lock.ts";
import {
  type LocalHarnessInput,
  type LocalHarnessParts,
  openLocalHarnessHost,
} from "./local-harness-host.ts";
import { runSendingSettings } from "./run-sending.ts";
import type { RunFiles } from "./version-files.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";
import { workspaceStore } from "./workspace-store.ts";
import type { WorkspaceVersions } from "./workspace-versions.ts";

export type { EngineErrorSource, LocalEngine } from "@halonicjs/adapter-workspace-engine-node";
export type { EngineHolder };

/** What {@link openLocalEngine} builds the engine from. */
export interface LocalEngineInput
  extends Omit<
    OpenLocalEngineInput,
    | "declaredToolIntegrations"
    | "versions"
    | "environment"
    | "openHarnessHost"
    | "listedToolApproval"
    | "holder"
  > {
  /**
   * The local integrations of `workspace`, as its trust check read them
   * from the same version: what a run's definitions take declared tools
   * from when `versions` is left out. Left out, none: no tool takes a noun
   * from a sheet, which fails safe.
   */
  readonly integrations?: readonly LocalIntegrationInput[];
  /**
   * For an engine whose runs read more than one version of the workspace,
   * as `routines watch`'s: each run starts with the definitions of the
   * version it records, and models, chat agents and their connectors' tools
   * come from the version read last. Left out, everything reads `workspace`,
   * as for `halonic run`.
   */
  readonly versions?: WorkspaceVersions;
  /**
   * For `halonic run` and `halonic runs send`: the agents' and skills'
   * files of the version each run read, which the harness checks "On this
   * computer" against and pins the instructions from. Left out, they come
   * from `versions`, else from disk.
   */
  readonly runFiles?: RunFiles;
  /**
   * Halonic's other ports on this computer, which a harness run's bridge
   * never calls a provider on: `serve`'s, where it runs. Read on every call.
   */
  readonly ownPorts?: () => Iterable<number>;
  /**
   * Hears the listed tools that wait for a person's approval, once for each
   * turn that leaves some out. A run's turn can't ask, so this is where the
   * command to approve them is named.
   */
  reportWaiting?(connector: string, waiting: readonly ChatTurnWaiting[]): void;
  /**
   * Hears the access each harness agent's bridge got (HAL-12784): the
   * provider and the secret's name, never a value.
   */
  readonly reportAccess?: LocalHarnessInput["reportAccess"];
  /**
   * What each top-level run starts its hub's connectors with, in the folder
   * its programs start in. Left out, a run calls no connector.
   */
  readonly runConnectors?: LocalRunConnectorsInput;
  /**
   * The Node parts the harness host is built from, which a test replaces:
   * this computer's srt sandbox, launcher, harnesses and bridge by default.
   */
  readonly harnessParts?: LocalHarnessParts;
  /** Where the profile folder is; this process's by default. */
  readonly environment?: ProfileEnvironment;
  /**
   * The command that opens the engine, written into its lock, so a command
   * the lock refuses can name it (HAL-14299). Left out, the lock names only
   * the process.
   */
  readonly holder?: EngineHolder;
}

/**
 * Opens the engine of the workspace in `input.workspaceRoot` with the CLI's
 * parts, as the shared `openLocalEngine` says.
 *
 * @throws KindedError `conflict` when another engine is open on the workspace
 * @throws when the workspace folder doesn't exist, or `HALONIC_HOME` or the
 *   home folder isn't an absolute folder
 *
 * @example
 * const engine = await openLocalEngine({ workspace, workspaceRoot, secrets, http, reportError });
 * await new WorkflowRuns(engine.executor).startRun(workspace, "support-reply", input);
 * await engine.close();
 */
export async function openLocalEngine(input: LocalEngineInput): Promise<LocalEngine> {
  const {
    integrations,
    runFiles,
    ownPorts,
    reportWaiting,
    reportAccess,
    runConnectors,
    harnessParts,
    environment,
    holder,
    ...shared
  } = input;
  const declaredToolIntegrations = approvedIntegrations(
    runConnectors?.trust ?? null,
    integrations ?? [],
  );
  try {
    return await openSharedEngine({
      ...shared,
      environment: environment ?? nodeProfileEnvironment(),
      ...(declaredToolIntegrations === undefined ? {} : { declaredToolIntegrations }),
      ...(runConnectors === undefined
        ? {}
        : { runConnectors: withSendingNextStep(runConnectors, input.workspace) }),
      ...(holder === undefined ? {} : { holder: engineHolders[holder].command }),
      openHarnessHost: cliHarnessHost(input),
      // The approvals a person gave with `halonic tools`, read at the start of every turn.
      listedToolApproval: ({ location, profile }: EnginePlace, latest) =>
        cliListedToolApproval({
          location,
          workspace: latest,
          approvals: new FileToolApprovalStore(toolApprovalFolder(profile)),
          trust: new FileTrustStore(trustFolder(profile)),
          digest: webCryptoDigest,
          clock: input.clock ?? systemClock,
          ...(reportWaiting === undefined ? {} : { reportWaiting }),
        }),
    });
  } catch (error) {
    // The shared engine throws this only for its own lock: another engine is open.
    if (error instanceof LockHeldError) throw engineLockRefusal(error);
    throw error;
  }
}

/**
 * `runConnectors` whose refused sends name the next step, as the model may
 * pass it on to the person (`runSendingSettings`, HAL-15772): the engine
 * passes a refusal's reason on as it is.
 *
 * @example
 * await withSendingNextStep(runConnectors, workspace).sending.checkSending({ location, connector: "notes" });
 * // { allowed: false, reason: 'sending is off for the connector "notes". Halonic can\'t switch it on yet.' }
 */
export function withSendingNextStep(
  runConnectors: LocalRunConnectorsInput,
  workspace: LoadedWorkspace,
): LocalRunConnectorsInput {
  return { ...runConnectors, sending: runSendingSettings(runConnectors.sending, workspace) };
}

/** The CLI's harness host for the engine `input` opens, on this computer's parts. */
function cliHarnessHost(input: LocalEngineInput): OpenEngineHarnessHost {
  return ({ location, folders, profile, environment }) =>
    openLocalHarnessHost({
      location,
      folders,
      profile,
      environment,
      workspace: () => input.versions?.latest() ?? input.workspace,
      ...(input.versions === undefined ? {} : { versions: input.versions }),
      ...(input.runFiles === undefined ? {} : { runFiles: input.runFiles }),
      store: workspaceStore(location, location, profile),
      digest: webCryptoDigest,
      clock: input.clock ?? systemClock,
      openRuns: () => openRunsOf(new FolderRunStore(folders.runsFolder())),
      reportError: (error) => input.reportError(error, "harness-host"),
      reportBridgeError: (error) => input.reportError(error, "harness-bridge"),
      reportHostLock: (error) => input.reportError(error, "host-lock"),
      secrets: input.secrets,
      keyOrigins: input.keyOrigins,
      trusted: input.trusted,
      ...(input.ownPorts === undefined ? {} : { ownPorts: input.ownPorts }),
      ...(input.reportAccess === undefined ? {} : { reportAccess: input.reportAccess }),
      ...(input.git === undefined ? {} : { git: input.git }),
      ...(input.harnessParts === undefined ? {} : { parts: input.harnessParts }),
    });
}

/**
 * The runs the engine hasn't ended, whose proposal folders stay at the
 * host's start: those waiting for a person, and those it will end as
 * interrupted on its first run.
 */
async function openRunsOf(runs: RunStore): Promise<ReadonlySet<string>> {
  const open = await runs.list({ status: ["running", "waiting"] });
  return new Set(open.map((run) => run.id));
}
