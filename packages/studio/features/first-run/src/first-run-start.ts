import type { ChoiceChange } from "@halonicjs/app";
import type { RunStartHost } from "@halonicjs/studio-feature-runs/api";
import type { WorkflowGuideRun } from "@halonicjs/studio-feature-workflows/api";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import { type FirstRun, SUPPORT_HUB, SUPPORT_WORKFLOW } from "./first-run.ts";
import { runWords } from "./first-run-words.ts";
import type { PickModelDone } from "./pick-model/pick-model-state.ts";

/**
 * Sam's email, the input of the first run (first-run-flow 3.4): Acme's
 * `examples/refund-question.json`, which every copy of the demo has. A test keeps the two the same.
 */
export const refundQuestion: Readonly<Record<string, unknown>> = {
  mail: "Hi, my order #1042 arrived damaged. Can I get a refund? — Sam (invented)",
};

/** The run Continue started, and what the first run says about it. */
interface Started {
  readonly runId: string;
  /** The "Changed …" line of the model Continue saved; none for Sample answers. */
  readonly changed: string | undefined;
  /** Whether this run shows the caption: only the first run Continue starts. */
  readonly caption: boolean;
}

/**
 * The run in the first run (`first-run.run`): Continue on Pick a model starts Support reply at
 * once with Sam's email and shows it on the page, **Cancel run** ends it, and the page of that run
 * gets the change line and the caption once, and **Pick another model**.
 *
 * @example
 * const start = new FirstRunStart(firstRun, runStartHost);
 * await start.continueWith({ kind: "sample" }, showRun);
 */
export class FirstRunStart {
  readonly #firstRun: FirstRun;
  readonly #runStart: RunStartHost | undefined;
  readonly #listeners = new Set<() => void>();
  #started: Started | undefined;
  /** The last change line, which the guide card shows again after **Cancel run** (8e.2). */
  #changed: string | undefined;
  #captionShown = false;
  /** The runs **Cancel run** ended, which the page takes off so the guide card shows. */
  readonly #cancelled = new Set<string>();
  /** Whether the last run ended with **Cancel run**, until Continue starts another. */
  #lastCancelled = false;

  constructor(firstRun: FirstRun, runStart: RunStartHost | undefined) {
    this.#firstRun = firstRun;
    this.#runStart = runStart;
  }

  /** Whether Continue can start the run here: not where there is no engine, such as a served page. */
  get canStart(): boolean {
    return this.#runStart !== undefined;
  }

  /** Whether **Cancel run** can end the run here: only where the engine can cancel one. */
  get canCancel(): boolean {
    return this.#runStart?.cancelRun !== undefined;
  }

  /** Whether **Cancel run** ended the last run, so the bar can say so until Continue starts another. */
  get lastCancelled(): boolean {
    return this.#lastCancelled;
  }

  /** The change line of the last model Continue saved, for the guide card after Cancel run. */
  get changedLine(): string | undefined {
    return this.#changed;
  }

  /**
   * After Continue on Pick a model: starts Support reply with Sam's email, closes the screen and
   * shows the run on the page with `showRun`.
   *
   * @throws the reason the run didn't start, with the screen left open
   */
  async continueWith(done: PickModelDone, showRun: (runId: string) => void): Promise<void> {
    const runStart = this.#runStart;
    if (runStart === undefined) throw new Error("This page can't start a run.");
    if (done.kind === "saved") this.#changed = changedLine(done.changes);
    const { runId } = await runStart.startRun(
      { hubId: SUPPORT_HUB, workflowId: SUPPORT_WORKFLOW },
      { ...refundQuestion },
    );
    this.#started = { runId, changed: this.#changed, caption: !this.#captionShown };
    this.#captionShown = true;
    this.#lastCancelled = false;
    showRun(runId);
    this.#firstRun.closePicker("started");
    this.#tell();
  }

  /**
   * **Cancel run**: ends the run the first run is at as cancelled, and takes it off the page, so
   * the guide card shows **Run again**. The run's record stays.
   *
   * @throws the engine's reason when it couldn't cancel
   */
  async cancel(): Promise<void> {
    // Right after Continue the runs list may not have the run yet: the bar is at Run already.
    const runId = this.#firstRun.runningId ?? this.#justStarted();
    const cancelRun = this.#runStart?.cancelRun;
    if (runId === undefined || cancelRun === undefined) return;
    await cancelRun(runId);
    this.#cancelled.add(runId);
    this.#lastCancelled = true;
    this.#tell();
  }

  /** The run Continue started, while the first run is at Run and it hasn't failed or ended. */
  #justStarted(): string | undefined {
    const state = this.#firstRun.state;
    if (state.kind !== "on" || state.step !== "run" || state.failed || state.ended)
      return undefined;
    return this.#started?.runId;
  }

  /** What the first run adds to the page of `runId`, while it is on here. */
  additions(runId: string): WorkflowGuideRun | undefined {
    if (!this.#firstRun.isOnHere) return undefined;
    const pickAnotherModel = () => this.#firstRun.pickModel();
    const started = this.#started?.runId === runId ? this.#started : undefined;
    return {
      notes: started?.changed === undefined ? [] : [started.changed],
      caption: started?.caption === true ? runWords.caption : undefined,
      pickAnotherModel,
      dismissed: this.#cancelled.has(runId),
    };
  }

  /** Calls `listener` after the run's additions change. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #tell(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}

/** The run in the first run, which the bar and the guide reach (`first-run.start`). */
export const FirstRunStartService: ServiceKey<FirstRunStart> =
  serviceKey<FirstRunStart>("first-run.start");

/**
 * The one quiet line that says what Continue changed in the demo's files (8e.2, 10.2 R4), or
 * `undefined` when it changed no model.
 */
export function changedLine(changes: readonly ChoiceChange[]): string | undefined {
  const alias = changes.find((change) => change.kind === "alias-repointed");
  if (alias?.kind !== "alias-repointed") return undefined;
  const localOnlyOff = changes.some((change) => change.kind === "local-only-off");
  const line = aliasLine(alias, localOnlyOff);
  const added = changes.flatMap((change) =>
    change.kind === "provider-added" ? [runWords.added(change.file)] : [],
  );
  return [line, ...added].join(" ");
}

/** The models.yaml part of the line: a local model by its name, a provider with a key by its. */
function aliasLine(
  alias: Extract<ChoiceChange, { kind: "alias-repointed" }>,
  localOnlyOff: boolean,
): string {
  if (alias.local) return runWords.changedLocal(alias.model);
  return localOnlyOff
    ? runWords.changedKeyAndLocalOnly(alias.providerName)
    : runWords.changedKey(alias.providerName);
}
