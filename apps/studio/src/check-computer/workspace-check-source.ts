import type { HostDoctorLine, HostDoctorReport } from "@halonicjs/adapter-agent-host-client";
import {
  type AliasProvider,
  type DefaultModelLine,
  type DoctorProvider,
  defaultModelLine,
  type LastRunInput,
  lastRunLine,
  type ModelsLine,
  type SandboxLine,
  type TimedOutLine,
} from "@halonicjs/app";
import type {
  CheckComputerSource,
  CheckFact,
  GoogleFact,
  HostFact,
  LastRunFact,
  ModelKey,
  ModelsFact,
  ModelTest,
} from "@halonicjs/studio-feature-check-computer/api";

/** The workspace's model aliases and the providers they use, as `halonic doctor` reads them. */
export interface WorkspaceModelFacts {
  readonly aliases: readonly AliasProvider[];
  readonly providers: readonly DoctorProvider[];
  /** Whether `workspace.yaml` sets `privacy.localOnly: true`. */
  readonly localOnly: boolean;
}

/** The failed run the Last run line names, with the hub it is in. */
export type LastFailedRun = LastRunInput & { readonly hub: string };

/** What {@link WorkspaceCheckSource} asks, for one open folder. */
export interface CheckSourceParts {
  /** "Halonic 0.1.0 · macOS". */
  readonly about: string;
  readonly isDemo: () => boolean;
  /** Whether the open folder's engine answers now. */
  readonly engineAnswers: () => Promise<boolean>;
  /** The agent host's doctor for the folder; `undefined` where Studio has no agent host. */
  readonly hostDoctor: (() => Promise<HostDoctorReport>) | undefined;
  readonly readModels: () => Promise<WorkspaceModelFacts>;
  /** Whether a key is stored under the secret name; it never reads the key. */
  readonly keyStored: (secret: string) => Promise<boolean>;
  /** The last run, when it failed. */
  readonly lastFailedRun: () => Promise<LastFailedRun | undefined>;
  /** Each Google setup that was started and isn't finished. */
  readonly googleSetups: () => Promise<readonly GoogleFact[]>;
  /** The last test of each provider this session. */
  readonly tests: () => readonly ModelTest[];
}

/** What a part that failed gives: nothing, said once on the console, so the dialog shows no wrong line. */
async function orNothing<T>(what: string, promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise;
  } catch (error) {
    console.error(`Check this computer couldn't read ${what}.`, error);
    return undefined;
  }
}

/** The host's line without the actions it offers: the dialog works its buttons out from the facts. */
function hostFact(line: HostDoctorLine): HostFact | undefined {
  const { actions: _actions, ...fact } = line;
  switch (fact.check) {
    case "workspace":
    case "sandbox":
    case "harnesses":
    case "network":
    case "disk":
      return fact as HostFact;
    default:
      return undefined;
  }
}

type ServersLine = ModelsLine | TimedOutLine<"models">;

/** The host's Models line: only the model servers on this computer. */
function serversOf(report: HostDoctorReport | undefined): ServersLine | undefined {
  return report?.checks.find((line) => line.check === "models") as ServersLine | undefined;
}

function sandboxOf(report: HostDoctorReport | undefined): SandboxLine | TimedOutLine<"sandbox"> {
  const line = report?.checks.find((each) => each.check === "sandbox");
  // Without the host's answer the sandbox is unknown, so a run's sandbox cause points at no line.
  return (
    (line as SandboxLine | undefined) ?? { check: "sandbox", status: "warning", timedOut: true }
  );
}

/**
 * Check this computer's facts for one open folder (requirement `studio.check-computer.source`):
 * the agent host's doctor for the lines that need Node, and Studio's own knowledge for the
 * Engine, the Models line's keys, Default model, Last run and Google. Every part starts at once
 * and each line is given as soon as what it needs has answered; a part that fails gives no line.
 * In the demo, the sandbox and the harnesses aren't used, so they read as Not checked, and Disk
 * shows only when it is low (first-run-progress 4.1).
 */
export class WorkspaceCheckSource implements CheckComputerSource {
  readonly #parts: CheckSourceParts;

  constructor(parts: CheckSourceParts) {
    this.#parts = parts;
  }

  get about(): string {
    return this.#parts.about;
  }

  isDemo(): boolean {
    return this.#parts.isDemo();
  }

  async *check(signal: AbortSignal): AsyncIterable<CheckFact> {
    const parts = this.#parts;
    const demo = parts.isDemo();
    const engine = orNothing("the engine", parts.engineAnswers());
    const google = orNothing("the Google setups", parts.googleSetups());
    const host =
      parts.hostDoctor === undefined ? undefined : orNothing("this computer", parts.hostDoctor());
    const models = orNothing("the models", parts.readModels());
    const lastRun = orNothing("the last run", parts.lastFailedRun());

    const running = await engine;
    if (running !== undefined) yield { check: "engine", running };
    for (const setup of (await google) ?? []) yield setup;
    if (signal.aborted) return;

    const report = await host;
    yield* this.#hostLines(report, demo);
    const facts = await models;
    if (signal.aborted) return;
    const servers = serversOf(report);
    const modelsFact = facts === undefined ? undefined : await this.#modelsFact(facts, servers);
    if (modelsFact !== undefined) yield modelsFact;
    const defaultModel =
      facts === undefined || !demo ? undefined : defaultModelLine({ ...facts, models: servers });
    if (defaultModel !== undefined) yield defaultModel;

    const failed = await lastRun;
    const line =
      failed === undefined
        ? undefined
        : lastRunOf(failed, servers, sandboxOf(report), defaultModel);
    if (line !== undefined) yield line;
  }

  /** The host's lines, but in the demo the sandbox and harnesses as Not checked, and Disk only when low. */
  async *#hostLines(report: HostDoctorReport | undefined, demo: boolean): AsyncIterable<CheckFact> {
    for (const line of report?.checks ?? []) {
      const fact = hostFact(line);
      if (fact === undefined) continue;
      if (demo && (fact.check === "sandbox" || fact.check === "harnesses")) continue;
      if (demo && fact.check === "disk" && fact.status === "ok") continue;
      yield fact;
    }
    if (demo) yield { check: "not-checked", parts: ["sandbox", "harnesses"] };
  }

  /** The Models line: the host's servers, each cloud provider's key, Sample answers and the last tests. */
  async #modelsFact(
    facts: WorkspaceModelFacts,
    servers: ServersLine | undefined,
  ): Promise<ModelsFact | undefined> {
    const keys: ModelKey[] = [];
    for (const provider of facts.providers) {
      if (provider.runs !== "with-a-key") continue;
      const stored = await this.#parts
        .keyStored(provider.secret)
        .catch(() => "unreadable" as const);
      keys.push({ provider: provider.name, keyStored: stored });
    }
    const sampleAnswers = facts.providers.some(
      (provider) => provider.runs === "without-a-key" && provider.testModel === true,
    );
    if (servers === undefined && keys.length === 0 && !sampleAnswers) return undefined;
    return { check: "models", servers, keys, sampleAnswers, tests: this.#parts.tests() };
  }
}

/** The Last run line, pointing at the line above that shows its cause, with the run's hub. */
function lastRunOf(
  failed: LastFailedRun,
  models: ServersLine | undefined,
  sandbox: SandboxLine | TimedOutLine<"sandbox">,
  defaultModel: DefaultModelLine | undefined,
): LastRunFact | undefined {
  const { hub, ...run } = failed;
  // Only the lines there are: the report's optional lines are left out, not undefined.
  const line = lastRunLine(run, {
    sandbox,
    ...(models === undefined ? {} : { models }),
    ...(defaultModel === undefined ? {} : { defaultModel }),
  });
  return line === undefined ? undefined : { ...line, hub };
}
