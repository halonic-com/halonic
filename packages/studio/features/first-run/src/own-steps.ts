import type { AgentRef, AgentsHost } from "@halonicjs/studio-feature-agents/api";
import type { ModelKeys, ModelsFiles, ProviderCheck } from "@halonicjs/studio-feature-models/api";
import type { RunsList } from "@halonicjs/studio-feature-runs/api";
import type { OwnCardMemory, SampleWorkspace } from "./api.ts";
import {
  agentStepDone,
  type DefaultProvider,
  type DefaultProviderFiles,
  type ModelStep,
  modelStep,
  ownCardVisit,
  readDefaultProvider,
  runStepDone,
} from "./own-progress.ts";

/** How long step 1 waits for a local provider before it counts as not answering (first-run-progress 3.1). */
export const CHECK_LIMIT_MS = 5000;

/** What Get set up reads to work its steps out, and where it remembers the card. */
export interface OwnStepsSources {
  readonly files: DefaultProviderFiles & Pick<ModelsFiles, "subscribe">;
  readonly agents: Pick<AgentsHost, "list" | "subscribe">;
  readonly runs: Pick<RunsList, "state" | "subscribe">;
  readonly keys?: Pick<ModelKeys, "stored"> | undefined;
  readonly check?: ProviderCheck | undefined;
  readonly memory: Pick<SampleWorkspace, "ownCardMemory" | "recordOwnCard">;
  readonly now: () => Date;
}

/** Step 1 as its row shows it, also while it asks a local provider. */
export type OwnModelRow =
  | ModelStep
  | { readonly status: "checking"; readonly since: Date; readonly address: string | undefined };

/** What the card shows now. */
export type OwnStepsState =
  /** A step isn't worked out yet, so whether the card shows isn't known: nothing shows. */
  | { readonly kind: "loading" }
  /** The card is gone on this visit (`first-run.own-progress`). */
  | { readonly kind: "hidden" }
  /** A file, the agents or a key couldn't be read: the section shows its error. */
  | { readonly kind: "failed"; readonly error: unknown }
  | {
      readonly kind: "showing";
      readonly model: OwnModelRow;
      /** The provider step 1 names while it checks and in its problem, such as "Ollama". */
      readonly providerName: string;
      readonly agentDone: boolean;
      readonly runDone: boolean;
      /** The agent step 3 opens: the last one listed, or `undefined` before there's one. */
      readonly lastAgent: AgentRef | undefined;
    };

/**
 * Get set up's three steps for one visit to Home (`first-run.own-card`), worked out by the rules
 * of `first-run.own-progress` and followed while Home shows: the files, the agents and the runs.
 * Whether the card shows is decided once per visit, as soon as that's known.
 *
 * @example
 * const steps = new OwnSteps(sources);
 * const stop = steps.start();
 * steps.subscribe(() => render(steps.state));
 */
export class OwnSteps {
  readonly #sources: OwnStepsSources;
  readonly #listeners = new Set<() => void>();
  #memory: OwnCardMemory;
  #shows: boolean | undefined;
  #provider: DefaultProvider | undefined;
  #model: OwnModelRow | undefined;
  #agents: readonly AgentRef[] | undefined;
  /** Each read counts up, so a slower, older read can't overwrite a newer one. */
  #modelRead = 0;
  #agentsRead = 0;
  /** A file, the agents or a key couldn't be read: the visit stays on that error. */
  #failure: { readonly error: unknown } | undefined;
  /** Home has closed: a read or check still in flight changes nothing and remembers nothing. */
  #stopped = false;
  #state: OwnStepsState = { kind: "loading" };

  constructor(sources: OwnStepsSources) {
    this.#sources = sources;
    this.#memory = sources.memory.ownCardMemory();
  }

  /** What the card shows now. */
  get state(): OwnStepsState {
    return this.#state;
  }

  /** Works the steps out and follows what they read. Returns a function that stops following. */
  start(): () => void {
    const stops = [
      this.#sources.runs.subscribe(() => this.#update()),
      this.#sources.agents.subscribe(() => void this.#readAgents()),
      this.#sources.files.subscribe(() => void this.checkModel({ again: false })),
    ];
    void this.#readAgents();
    void this.checkModel();
    return () => {
      this.#stopped = true;
      for (const stop of stops) stop();
    };
  }

  /**
   * Works step 1 out: **Check again** asks the provider again; a change of the files asks only
   * when `default` now names another provider.
   */
  async checkModel({ again = true }: { readonly again?: boolean } = {}): Promise<void> {
    const started = this.#modelRead;
    try {
      const provider = await readDefaultProvider(this.#sources.files);
      if (started !== this.#modelRead) return;
      if (!again && JSON.stringify(provider) === JSON.stringify(this.#provider)) return;
      // Only a read that asks again takes a new number: one that finds the same provider must
      // leave the check in flight to finish, or the row would stay on "Checking…".
      const read = ++this.#modelRead;
      this.#provider = provider;
      const { keys, check } = this.#sources;
      if (provider.kind === "local" && check !== undefined) {
        const address = check.addressOf(provider.provider);
        this.#model = { status: "checking", since: this.#sources.now(), address };
        this.#update();
      }
      const model = await modelStep(provider, { keys, check: withLimit(check) });
      if (read !== this.#modelRead) return;
      this.#model = model;
      this.#update();
    } catch (error) {
      this.#fail(error);
    }
  }

  /** Calls `listener` after every change of {@link state}. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async #readAgents(): Promise<void> {
    const read = ++this.#agentsRead;
    try {
      const agents = await this.#sources.agents.list();
      if (read !== this.#agentsRead) return;
      this.#agents = agents;
      this.#update();
    } catch (error) {
      this.#fail(error);
    }
  }

  #fail(error: unknown): void {
    if (this.#stopped) return;
    this.#failure = { error };
    this.#state = { kind: "failed", error };
    this.#tell();
  }

  #update(): void {
    if (this.#stopped || this.#failure !== undefined) return;
    const next = this.#workOut();
    if (next === undefined) return;
    this.#state = next;
    this.#tell();
  }

  /** The card's state now, or `undefined` while whether it shows can't be told yet. */
  #workOut(): OwnStepsState | undefined {
    const model = this.#model;
    const agents = this.#agents;
    const runs = this.#sources.runs.state;
    // Runs that have never loaded show as the section's error, until a later load of the list
    // succeeds and brings the steps back.
    if (!runs.loaded && runs.error !== undefined) return { kind: "failed", error: runs.error };
    if (model === undefined || agents === undefined || !runs.loaded) return undefined;
    const agentDone = agentStepDone(agents);
    const runDone = runStepDone(runs.runs.map((each) => each.summary));
    // A folder seen for the first time waits for the check only when it alone decides whether
    // all three are done, so it never shows a card that turns out finished.
    const waits = this.#memory === "unseen" && model.status === "checking" && agentDone && runDone;
    if (this.#shows === undefined && waits) return undefined;
    const visit = ownCardVisit(this.#memory, model.status === "done" && agentDone && runDone);
    this.#shows ??= visit.shows;
    if (visit.remember !== this.#memory) {
      this.#memory = visit.remember;
      this.#sources.memory.recordOwnCard(visit.remember);
    }
    if (!this.#shows) return { kind: "hidden" };
    const provider = this.#provider;
    // A provider file without a name is called by its id, as the Models list calls it.
    const providerName =
      provider?.kind === "local" || provider?.kind === "cloud"
        ? (provider.provider.name ?? provider.provider.id)
        : "";
    return { kind: "showing", model, providerName, agentDone, runDone, lastAgent: agents.at(-1) };
  }

  #tell(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}

/** The provider check, giving up at {@link CHECK_LIMIT_MS}: a provider that hasn't answered by then doesn't. */
function withLimit(check: ProviderCheck | undefined): ProviderCheck | undefined {
  if (check === undefined) return undefined;
  return {
    addressOf: (provider) => check.addressOf(provider),
    isAnswering: (provider) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(false), CHECK_LIMIT_MS);
        check.isAnswering(provider).then(
          (answering) => {
            clearTimeout(timer);
            resolve(answering);
          },
          (error: unknown) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      }),
  };
}
