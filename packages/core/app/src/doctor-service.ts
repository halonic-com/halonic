// Puts `halonic doctor` together: it asks each part of the machine once, all
// at the same time, and hands what it found to the line functions, which
// decide the marks. It holds no words: the CLI words the report from its
// message catalogue (cli-output 3.7), and the Studio can show the same report.

import type { Harness, Sandbox, Secrets } from "@halonicjs/ports";
import {
  type DetectedHarness,
  type DoctorLine,
  type DoctorSummary,
  doctorSummary,
  type HarnessAgent,
  type HarnessesLine,
  harnessesLine,
} from "./doctor-checks.ts";
import {
  type DiskLine,
  diskLine,
  type NodeLine,
  type NodeProblem,
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
import type { ProviderModels, ResourceReport } from "./resource-report.ts";
import type { SandboxChoiceService } from "./sandbox-choice.ts";
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
  /** Every harness Halonic can start other than its own loop. */
  harnesses: readonly Pick<Harness, "id" | "name" | "detect">[];
  /** The store the providers' keys are in, as `runCli` wrapped it. */
  secrets: Secrets;
  /**
   * What is wrong with the Node.js that runs Halonic, for the Node.js line.
   * Left out where the host checks nothing: then there is no such line.
   */
  node?: () => Promise<NodeProblem | null>;
}

/** Everything `halonic doctor` shows. A line that doesn't apply is left out. */
export interface DoctorReport {
  /** Only inside a workspace. */
  workspace?: WorkspaceLine;
  /** Only inside a workspace with model aliases. */
  models?: ModelsLine;
  sandbox: SandboxLine;
  /** Only where MXC is offered and the sandbox choice has started. */
  mxc?: MxcLine;
  /** Only when a harness is ready or an agent uses one. */
  harnesses?: HarnessesLine;
  /** Only when the host found a problem with the Node.js that runs Halonic. */
  node?: NodeLine;
  disk: DiskLine;
  /** The counts under the lines, and whether `doctor` exits 1. */
  summary: DoctorSummary;
}

/**
 * Checks that this computer can run Halonic, for `halonic doctor`
 * (requirement `app.doctor-service`). It reads the workspace's trust, its
 * models, the sandbox, the harnesses and the disk at the same time, so one
 * slow check doesn't wait for another, and it never calls a provider over
 * the internet.
 *
 * @example
 * const doctor = new DoctorService({ trust, sandbox, resources, harnesses, secrets });
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
    const { sandbox } = this.options;
    const [trust, sandboxCheck, resources, harnesses, keys, node] = await Promise.all([
      workspace === null || workspace.testModelOnly === true
        ? null
        : this.options.trust.check(workspace.trust),
      sandbox.check(),
      this.options.resources.read(),
      this.detectHarnesses(),
      this.storedKeys(workspace?.providers ?? []),
      this.options.node?.() ?? null,
    ]);

    const report: Omit<DoctorReport, "summary"> = {
      sandbox: sandboxLine(sandboxCheck, sandbox.capabilities()),
      disk: diskLine(resources),
    };
    if (workspace !== null) {
      report.workspace = workspaceLine(
        workspace.name,
        trust?.status ?? "not-needed",
        workspace.windowsDrive,
      );
      const providers = workspace.providers.map((provider) =>
        providerState(provider, resources.models, keys),
      );
      const models = modelsLine(providers, workspace.aliases);
      if (models !== undefined) report.models = models;
    }
    const choice = this.options.sandboxChoice?.current() ?? null;
    const mxc = choice === null ? undefined : mxcLine(choice);
    if (mxc !== undefined) report.mxc = mxc;
    const harnessLine = harnessesLine(harnesses, harnessAgents(workspace));
    if (harnessLine !== undefined) report.harnesses = harnessLine;
    const runtime = nodeLine(node);
    if (runtime !== undefined) report.node = runtime;

    return { ...report, summary: doctorSummary(linesOf(report)) };
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

  /** The providers whose key is stored, by id. Each key is read and dropped at once. */
  private async storedKeys(providers: readonly DoctorProvider[]): Promise<Set<string>> {
    const stored = new Set<string>();
    await Promise.all(
      providers.map(async (provider) => {
        if (provider.runs !== "with-a-key") return;
        if ((await this.options.secrets.get(provider.secret)) !== null) {
          stored.add(provider.provider);
        }
      }),
    );
    return stored;
  }
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

function linesOf(report: Omit<DoctorReport, "summary">): DoctorLine[] {
  const { workspace, models, sandbox, mxc, harnesses, node, disk } = report;
  return [workspace, models, sandbox, mxc, harnesses, node, disk].filter(
    (line) => line !== undefined,
  );
}
