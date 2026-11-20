// Puts `halonic doctor` together: it asks each part of the machine once, all
// at the same time, and hands what it found to the line functions, which
// decide the marks. It holds no words: the CLI words the report from its
// message catalogue (cli-output 3.7), and the Studio can show the same report.

import type { Sandbox, Secrets } from "@halonicjs/ports";
import {
  type DetectedHarness,
  type DoctorLine,
  type DoctorSummary,
  doctorSummary,
  type HarnessAgent,
  type HarnessesLine,
  harnessesLine,
  type SignedOutAgent,
} from "./doctor-checks.ts";
import {
  type DiskLine,
  diskLine,
  type NetworkLine,
  type NetworkProblem,
  type NodeLine,
  type NodeProblem,
  networkLine,
  nodeLine,
  type SandboxLine,
  sandboxLine,
  type WorkspaceLine,
  workspaceLine,
} from "./doctor-lines.ts";
import {
  type AliasProvider,
  type ModelProviderState,
  type ModelsLine,
  modelsLine,
} from "./doctor-models-line.ts";
import { type MxcLine, mxcLine } from "./doctor-mxc-line.ts";
import { type NoSandboxLine, noSandboxLine } from "./doctor-no-sandbox-line.ts";
import {
  type SecretsFound,
  type SecretsLine,
  secretsLine,
  type UsedSecret,
} from "./doctor-secrets-line.ts";
import {
  type AgentSettingsFolder,
  type DoctorHarness,
  signedOutAgents,
} from "./doctor-sign-ins.ts";
import {
  lineOf,
  type TimedOutLine,
  timedOut,
  timedOutLine,
  withinLimit,
} from "./doctor-time-limit.ts";
import type { ProviderModels, ResourceReport, Resources } from "./resource-report.ts";
import type { SandboxChoiceService } from "./sandbox-choice.ts";
import type { SaveTimers } from "./save-scheduler.ts";
import type { TrustCheck, TrustSubject } from "./trust-service.ts";

/**
 * A provider the workspace's aliases use, as the host reads it from its
 * file. The host decides how it runs, because only the host knows each
 * adapter's default address.
 */
export type DoctorProvider =
  | {
      provider: string;
      name: string;
      runs: "on-this-computer";
      /** Where Halonic reaches it, such as "localhost:11434". */
      address: string;
    }
  | {
      provider: string;
      name: string;
      runs: "with-a-key";
      /** The name of the secret that holds its key. */
      secret: string;
    }
  | { provider: string; name: string; runs: "without-a-key" };

/** The workspace `doctor` runs in. */
export interface DoctorWorkspace {
  /** The workspace's name, such as "acme". */
  name: string;
  /** What the trust check fingerprints. Its agents are also the Harnesses line's. */
  trust: TrustSubject;
  /** The workspace's model aliases, in the order of `models.yaml`. */
  aliases: readonly AliasProvider[];
  /** Every provider the aliases use. */
  providers: readonly DoctorProvider[];
  /**
   * The secrets a run here needs that the Models line doesn't check: those
   * of the connectors an agent uses, and those of a provider the aliases use
   * that isn't checked for a key there, such as the test model or a server
   * on this computer (HAL-14269). Left out, there's nothing to check.
   */
  secrets?: readonly UsedSecret[];
  /**
   * Whether a run here can only reach the test model, as
   * `reachesOnlyTheTestModel` finds: then it needs no trust, the trust check
   * isn't read, and the Workspace line is ✓ (HAL-6007).
   */
  testModelOnly?: boolean;
  /**
   * On WSL, the Windows drive the workspace is on, such as "/mnt/c", as the
   * host found it; left out elsewhere. The Workspace line warns about it.
   */
  windowsDrive?: string;
  /**
   * How many errors `halonic validate` finds in the workspace's files. Each
   * leaves a file out, so the Workspace line fails while there are any (HAL-6613).
   */
  fileProblems?: number;
  /**
   * The most files Studio's folder watch looks at, such as 50,000, only when
   * the host found more files than that in the workspace. The Workspace line
   * warns about it (HAL-12295).
   */
  tooManyFilesToWatch?: number;
  /**
   * The folder an agent's harness keeps its own settings in, its sign-in
   * among them, as `WorkspaceFolders.harnessSettingsFolder` gives it, or
   * `undefined` for an agent whose id can't name a folder. Left out where
   * the host has none: then the Harnesses line doesn't ask about the
   * agents' own sign-ins.
   */
  harnessSettingsFolder?: (agentId: string, harnessId: string) => string | undefined;
}

/** What {@link DoctorService} needs from the host. */
export interface DoctorServiceOptions {
  /** The `TrustService`: `doctor` reads only the status of its check. */
  trust: { check(subject: TrustSubject): Promise<Pick<TrustCheck, "status">> };
  sandbox: Pick<Sandbox, "check" | "capabilities">;
  /**
   * The sandbox choice, once started, for the MXC line. Left out where the
   * host has none: then there is no MXC line.
   */
  sandboxChoice?: Pick<SandboxChoiceService, "current">;
  /**
   * The resource report, built with a `LoadedModelSource` for every
   * provider on this computer, so `doctor` asks each of them only once.
   */
  resources: Pick<ResourceReport, "read">;
  /** Every harness Halonic can start other than its own loop, with its sign-in where it has one. */
  harnesses: readonly DoctorHarness[];
  /**
   * The store the providers' keys and the connectors' secrets are in, as a
   * run reads it: through `workspaceSecrets`, so a name a run refuses isn't
   * reported as set.
   */
  secrets: Secrets;
  /**
   * What is wrong with the Node.js that runs Halonic, for the Node.js line.
   * Left out where the host checks nothing: then there is no such line.
   */
  node?: () => Promise<NodeProblem | null>;
  /**
   * What is wrong with the network settings, such as the proxy, for the
   * Network line. Read without any network call, so it has no time limit.
   * Left out where the host checks nothing: then there is no such line.
   */
  network?: () => NetworkProblem | null;
  /**
   * The clock each check's 5-second limit runs on: `setTimeout` and
   * `clearTimeout`, or a test's own.
   */
  timers: SaveTimers;
}

/**
 * Everything `halonic doctor` shows. A line that doesn't apply is left out.
 * A check that didn't answer in 5 seconds has a {@link TimedOutLine} instead.
 */
export interface DoctorReport {
  /** Only inside a workspace. */
  workspace?: WorkspaceLine | TimedOutLine<"workspace">;
  /** Only inside a workspace with model aliases. */
  models?: ModelsLine | TimedOutLine<"models">;
  /** Only inside a workspace, while a secret it uses isn't set or couldn't be read. */
  secrets?: SecretsLine | TimedOutLine<"secrets">;
  sandbox: SandboxLine | TimedOutLine<"sandbox">;
  /** Only where MXC is offered and the sandbox choice has started. */
  mxc?: MxcLine;
  /** Only while the person's choice is no sandbox. */
  noSandbox?: NoSandboxLine;
  /** Only when a harness is ready or an agent uses one, or when finding them ran over. */
  harnesses?: HarnessesLine | TimedOutLine<"harnesses">;
  /** Only when the host found a problem with the Node.js that runs Halonic, or its check ran over. */
  node?: NodeLine | TimedOutLine<"node">;
  /** Only when the host found a problem with the network settings. */
  network?: NetworkLine;
  disk: DiskLine | TimedOutLine<"disk">;
  /** The counts under the lines, and whether `doctor` exits 1. */
  summary: DoctorSummary;
}

/**
 * Checks that this computer can run Halonic, for `halonic doctor`
 * (requirement `app.doctor-service`). It reads the workspace's trust, its
 * models, its secrets (`app.doctor-secrets`), the sandbox, the harnesses and
 * the disk at the same time, so one slow check doesn't wait for another,
 * and it never calls a provider over the internet. A check that hasn't answered after 5 seconds ends as a
 * warning, so one that hangs doesn't hold up the report.
 *
 * @example
 * const doctor = new DoctorService({ trust, sandbox, resources, harnesses, secrets, timers });
 * const report = await doctor.check(workspace);
 * return report.summary.needsFixing ? exitCode.failed : exitCode.ok;
 */
export class DoctorService {
  private readonly options: DoctorServiceOptions;

  constructor(options: DoctorServiceOptions) {
    this.options = options;
  }

  /**
   * Runs every check once.
   *
   * @param workspace the workspace `doctor` runs in, or `null` outside one:
   *   then there are no Workspace and Models lines, and no agent uses a harness
   * @throws when the trust check can't save a record it shrank, or when a
   *   provider on this computer has no `LoadedModelSource` in the resource report
   */
  async check(workspace: DoctorWorkspace | null): Promise<DoctorReport> {
    const { sandbox, timers } = this.options;
    const limited = <T>(check: Promise<T>) => withinLimit(timers, check);
    const [trust, sandboxCheck, resources, harnesses, keys, secrets, node] = await Promise.all([
      limited(this.trustStatus(workspace)),
      limited(sandbox.check()),
      limited(this.options.resources.read()),
      limited(this.checkHarnesses(workspace)),
      limited(this.storedKeys(workspace?.providers ?? [])),
      limited(this.findSecrets(workspace?.secrets ?? [])),
      limited(this.options.node?.() ?? Promise.resolve(null)),
    ]);

    const report: Omit<DoctorReport, "summary"> = {
      sandbox: lineOf(sandboxCheck, "sandbox", (found) =>
        sandboxLine(found, sandbox.capabilities()),
      ),
      disk: lineOf(resources, "disk", diskLine),
    };
    if (workspace !== null) {
      report.workspace = lineOf(trust, "workspace", (found) => trustLine(workspace, found));
      const models = workspaceModels(workspace, resources, keys);
      if (models !== undefined) report.models = models;
      const secretsFound = lineOf(secrets, "secrets", secretsLine);
      if (secretsFound !== undefined) report.secrets = secretsFound;
    }
    const choice = this.options.sandboxChoice?.current() ?? null;
    const mxc = choice === null ? undefined : mxcLine(choice);
    if (mxc !== undefined) report.mxc = mxc;
    const noSandbox = choice === null ? undefined : noSandboxLine(choice);
    if (noSandbox !== undefined) report.noSandbox = noSandbox;
    const harnessLine = lineOf(harnesses, "harnesses", (found) =>
      harnessesLine(found.detected, harnessAgents(workspace), found.signedOut),
    );
    if (harnessLine !== undefined) report.harnesses = harnessLine;
    const found = { ...report, ...hostFoundLines(node, this.options.network) };

    return { ...found, summary: doctorSummary(linesOf(found)) };
  }

  /** The trust check's status, or `null` when it isn't read: outside a workspace, or on the test model only. */
  private async trustStatus(
    workspace: DoctorWorkspace | null,
  ): Promise<TrustCheck["status"] | null> {
    if (workspace === null || workspace.testModelOnly === true) return null;
    return (await this.options.trust.check(workspace.trust)).status;
  }

  /** What each harness's `detect()` finds, then which agents aren't signed in in their own folder. */
  private async checkHarnesses(
    workspace: DoctorWorkspace | null,
  ): Promise<{ detected: DetectedHarness[]; signedOut: SignedOutAgent[] }> {
    const detected = await this.detectHarnesses();
    const signedOut = await signedOutAgents(
      this.options.harnesses,
      detected,
      agentSettingsFolders(workspace),
    );
    return { detected, signedOut };
  }

  private detectHarnesses(): Promise<DetectedHarness[]> {
    return Promise.all(
      this.options.harnesses.map(async (harness) => ({
        id: harness.id,
        name: harness.name,
        detection: await harness.detect(),
      })),
    );
  }

  /**
   * The providers whose key is stored, by id. Each key is read and dropped
   * at once. A key the store couldn't be asked about counts as not stored,
   * so the Models line warns about it instead of `doctor` failing.
   */
  private async storedKeys(providers: readonly DoctorProvider[]): Promise<Set<string>> {
    const stored = new Set<string>();
    await Promise.all(
      providers.map(async (provider) => {
        if (provider.runs !== "with-a-key") return;
        if ((await this.isSet(provider.secret)) === true) {
          stored.add(provider.provider);
        }
      }),
    );
    return stored;
  }

  /** Which secrets aren't set, and which the store couldn't be asked about, in the order given. */
  private async findSecrets(secrets: readonly UsedSecret[]): Promise<SecretsFound> {
    const set = await Promise.all(secrets.map((used) => this.isSet(used.secret)));
    return {
      missing: secrets.filter((_, index) => set[index] === false),
      unreadable: secrets.filter((_, index) => set[index] === "unreadable"),
    };
  }

  /**
   * Whether the store holds a secret. Its value is read and dropped at once.
   * A store that throws, such as a locked keychain, or one that refuses the
   * name, gives "unreadable", so one secret never takes `doctor` down.
   */
  private async isSet(secret: string): Promise<boolean | "unreadable"> {
    try {
      return (await this.options.secrets.get(secret)) !== null;
    } catch {
      return "unreadable";
    }
  }
}

/** The Workspace line by the trust check's status, or ✓ when it wasn't read. */
function trustLine(workspace: DoctorWorkspace, trust: TrustCheck["status"] | null): WorkspaceLine {
  return workspaceLine(workspace.name, trust ?? "not-needed", {
    windowsDrive: workspace.windowsDrive,
    fileProblems: workspace.fileProblems,
    tooManyFilesToWatch: workspace.tooManyFilesToWatch,
  });
}

/**
 * The Models line, or none without model aliases. It needs the stored keys,
 * and the resource report's loaded models when a provider runs on this
 * computer, so it ran over when one of those did.
 */
function workspaceModels(
  workspace: DoctorWorkspace,
  resources: Resources | typeof timedOut,
  keys: ReadonlySet<string> | typeof timedOut,
): ModelsLine | TimedOutLine<"models"> | undefined {
  if (workspace.aliases.length === 0) return undefined;
  const local = workspace.providers.some((provider) => provider.runs === "on-this-computer");
  if (keys === timedOut || (local && resources === timedOut)) return timedOutLine("models");
  const loaded = resources === timedOut ? [] : resources.models;
  const providers = workspace.providers.map((provider) => providerState(provider, loaded, keys));
  return modelsLine(providers, workspace.aliases);
}

/** A provider as the Models line takes it, with what the report and the secrets found. */
function providerState(
  provider: DoctorProvider,
  loaded: readonly ProviderModels[],
  keys: ReadonlySet<string>,
): ModelProviderState {
  const { provider: id, name } = provider;
  switch (provider.runs) {
    case "on-this-computer": {
      const found = loaded.find((models) => models.provider === id);
      if (found === undefined) {
        throw new Error(
          `The provider ${id} runs on this computer, but the resource report has no LoadedModelSource for it.`,
        );
      }
      return {
        provider: id,
        name,
        runs: provider.runs,
        address: provider.address,
        models: found.models,
      };
    }
    case "with-a-key":
      return { provider: id, name, runs: provider.runs, keyStored: keys.has(id) };
    case "without-a-key":
      return { provider: id, name, runs: provider.runs };
  }
}

/** The workspace's agents that run in a harness other than Halonic's own loop. */
function harnessAgents(workspace: DoctorWorkspace | null): HarnessAgent[] {
  if (workspace === null) return [];
  return workspace.trust.agents.flatMap((agent) =>
    agent.harness === undefined || agent.harness === "halonic"
      ? []
      : [{ agent: agent.name, harness: agent.harness }],
  );
}

/** The harness agents with their settings folders, where the host gives them. */
function agentSettingsFolders(workspace: DoctorWorkspace | null): AgentSettingsFolder[] {
  const folderOf = workspace?.harnessSettingsFolder;
  if (workspace === null || folderOf === undefined) return [];
  return workspace.trust.agents.flatMap((agent) => {
    if (agent.harness === undefined || agent.harness === "halonic") return [];
    const settingsFolder = folderOf(agent.id, agent.harness);
    if (settingsFolder === undefined) return [];
    return [{ agent: agent.name, harness: agent.harness, settingsFolder }];
  });
}

/** The Node.js and Network lines, each only when the host found a problem. */
function hostFoundLines(
  node: NodeProblem | null | typeof timedOut,
  network: DoctorServiceOptions["network"],
): Pick<DoctorReport, "node" | "network"> {
  const nodeFound = lineOf(node, "node", nodeLine);
  const networkFound = networkLine(network?.() ?? null);
  return {
    ...(nodeFound === undefined ? {} : { node: nodeFound }),
    ...(networkFound === undefined ? {} : { network: networkFound }),
  };
}

function linesOf(report: Omit<DoctorReport, "summary">): DoctorLine[] {
  const { workspace, models, secrets, sandbox, mxc, noSandbox, harnesses, node, network, disk } =
    report;
  return [
    workspace,
    models,
    secrets,
    sandbox,
    mxc,
    noSandbox,
    harnesses,
    node,
    network,
    disk,
  ].filter((line) => line !== undefined);
}
