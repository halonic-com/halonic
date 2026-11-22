import type { HostDoctorLine, HostDoctorReport } from "@halonicjs/adapter-agent-host-client";
import {
  type AliasProvider,
  type DefaultModelLine,
  type DoctorProvider,
  defaultModelLine,
  doctorCheckLimitMs,
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
import { asTheyAnswer, orNothing } from "./part-answers.ts";

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

/** How long Studio waits for one of its own parts: as long as `halonic doctor` waits for one check. */
const partLimitMs = doctorCheckLimitMs;

/**
 * How long Studio waits for the agent host's doctor. The host runs its checks at once, each within
 * {@link doctorCheckLimitMs}, so twice that leaves it time to start and to answer.
 */
const hostLimitMs = 2 * doctorCheckLimitMs;

/**
 * The host's lines when it failed or didn't answer in time: a warning that couldn't tell, as
 * `halonic doctor` gives a check that ran over, so the dialog says they didn't answer instead of
 * leaving them out. Network has no such line; a Network line that isn't there is no wrong line.
 */
const unansweredHostFacts: readonly HostFact[] = [
  { check: "workspace", status: "warning", timedOut: true },
  { check: "sandbox", status: "warning", timedOut: true },
  { check: "harnesses", status: "warning", timedOut: true },
  { check: "disk", status: "warning", timedOut: true },
];

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
 * The host's facts: the lines it answered, or each line saying it didn't answer when the host
 * failed or ran over, and none where Studio has no agent host.
 */
function hostFactsOf(report: HostDoctorReport | undefined, asked: boolean): readonly HostFact[] {
  if (report !== undefined) return report.checks.flatMap((line) => hostFact(line) ?? []);
  return asked ? unansweredHostFacts : [];
}

/** In the demo the sandbox and harnesses aren't used, and Disk shows only when it isn't fine. */
function leftOutOfDemo(fact: HostFact): boolean {
  if (fact.check === "sandbox" || fact.check === "harnesses") return true;
  return fact.check === "disk" && fact.status === "ok";
}

/** The host's lines, but in the demo the sandbox and harnesses as Not checked, and Disk only when low. */
function hostLinesOf(
  report: HostDoctorReport | undefined,
  asked: boolean,
  demo: boolean,
): CheckFact[] {
  const lines: CheckFact[] = hostFactsOf(report, asked).filter(
    (fact) => !(demo && leftOutOfDemo(fact)),
  );
  if (demo) lines.push({ check: "not-checked", parts: ["sandbox", "harnesses"] });
  return lines;
}

/** The Models and Default model lines, kept apart because Last run may point at either. */
interface ModelLines {
  readonly models: ModelsFact | undefined;
  readonly defaultModel: DefaultModelLine | undefined;
}

/** The lines that are there, in a group {@link asTheyAnswer} gives. */
function linesOf(...lines: readonly (CheckFact | undefined)[]): CheckFact[] {
  return lines.filter((line) => line !== undefined);
}

/**
 * Check this computer's facts for one open folder (requirement `studio.check-computer.source`):
 * the agent host's doctor for the lines that need Node, and Studio's own knowledge for the
 * Engine, the Models line's keys, Default model, Last run and Google. Every part starts at once
 * and each line is given as soon as what it needs has answered, so a slow Google read or agent
 * host holds back only the lines that need it. A part that fails or hangs gives no line, except
 * the host, whose lines then say it didn't answer. In the demo, the sandbox and the harnesses
 * aren't used, so they read as Not checked, and Disk shows only when it is low
 * (first-run-progress 4.1).
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
    const asked = parts.hostDoctor !== undefined;
    const report =
      parts.hostDoctor === undefined
        ? Promise.resolve(undefined)
        : orNothing("this computer", parts.hostDoctor(), hostLimitMs);
    const models = this.#modelLines(
      orNothing("the models", parts.readModels(), partLimitMs),
      report,
      demo,
    );
    const lastRun = orNothing("the last run", parts.lastFailedRun(), partLimitMs);

    yield* asTheyAnswer<CheckFact>(
      [
        orNothing("the engine", parts.engineAnswers(), partLimitMs).then((running) =>
          linesOf(running === undefined ? undefined : { check: "engine", running }),
        ),
        orNothing("the Google setups", parts.googleSetups(), partLimitMs).then(
          (setups) => setups ?? [],
        ),
        report.then((answer) => hostLinesOf(answer, asked, demo)),
        models.then((lines) => linesOf(lines.models, lines.defaultModel)),
        Promise.all([lastRun, report, models]).then(([failed, answer, lines]) =>
          linesOf(lastRunOf(failed, serversOf(answer), sandboxOf(answer), lines.defaultModel)),
        ),
      ],
      signal,
    );
  }

  /** The Models line, and Default model in the demo, once the models and the host have answered. */
  async #modelLines(
    models: Promise<WorkspaceModelFacts | undefined>,
    report: Promise<HostDoctorReport | undefined>,
    demo: boolean,
  ): Promise<ModelLines> {
    const [facts, answer] = await Promise.all([models, report]);
    if (facts === undefined) return { models: undefined, defaultModel: undefined };
    const servers = serversOf(answer);
    return {
      models: await this.#modelsFact(facts, servers),
      defaultModel: demo ? defaultModelLine({ ...facts, models: servers }) : undefined,
    };
  }

  /** The Models line: the host's servers, each cloud provider's key, Sample answers and the last tests. */
  async #modelsFact(
    facts: WorkspaceModelFacts,
    servers: ServersLine | undefined,
  ): Promise<ModelsFact | undefined> {
    const keys: ModelKey[] = await Promise.all(
      facts.providers
        .filter((provider) => provider.runs === "with-a-key")
        .map(async (provider) => ({
          provider: provider.name,
          keyStored: await this.#keyStored(provider.name, provider.secret),
        })),
    );
    const sampleAnswers = facts.providers.some(
      (provider) => provider.runs === "without-a-key" && provider.testModel === true,
    );
    if (servers === undefined && keys.length === 0 && !sampleAnswers) return undefined;
    return { check: "models", servers, keys, sampleAnswers, tests: this.#parts.tests() };
  }

  /** Whether the key is stored, or "unreadable" when the key store fails or doesn't answer in time. */
  async #keyStored(provider: string, secret: string): Promise<boolean | "unreadable"> {
    const stored = await orNothing(`${provider}'s key`, this.#parts.keyStored(secret), partLimitMs);
    return stored ?? "unreadable";
  }
}

/** The Last run line when the last run failed, pointing at the line above that shows its cause, with the run's hub. */
function lastRunOf(
  failed: LastFailedRun | undefined,
  models: ServersLine | undefined,
  sandbox: SandboxLine | TimedOutLine<"sandbox">,
  defaultModel: DefaultModelLine | undefined,
): LastRunFact | undefined {
  if (failed === undefined) return undefined;
  const { hub, ...run } = failed;
  // Only the lines there are: the report's optional lines are left out, not undefined.
  const line = lastRunLine(run, {
    sandbox,
    ...(models === undefined ? {} : { models }),
    ...(defaultModel === undefined ? {} : { defaultModel }),
  });
  return line === undefined ? undefined : { ...line, hub };
}
