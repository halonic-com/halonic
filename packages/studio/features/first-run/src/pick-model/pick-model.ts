import {
  type ChoiceChange,
  type FirstRunKeyProvider,
  firstRunKeyProviders,
  type LocalModels,
  type ModelChoice,
} from "@halonicjs/app";
import type { SecretText } from "@halonicjs/studio-kit";
import type { ModelChoiceLine, ModelChoiceService, ModelChoiceTest } from "../api.ts";
import { type PickProblem, problemOfSave, problemOfTest } from "./pick-problems.ts";

/** The three options of the Pick a model screen, in the order the screen lists them. */
export type PickOption = "key" | "local" | "sample";

/**
 * What the local option knows: `checking` while Studio asks Ollama, `desktop-only` in a window that
 * can't reach this computer (the browser demo), or what the detection found.
 */
export type LocalState =
  | { readonly kind: "checking" }
  | { readonly kind: "desktop-only" }
  | LocalModels;

/**
 * Where the one button is:
 * - `idle`: waiting for a press; `problem` says why the last one stopped, if it did.
 * - `testing`: the test call runs; `slow` once a local model took 30 seconds.
 * - `confirm`: the test passed, but the trust line changed, so the person presses Continue again.
 * - `saving`: Continue saves the choice.
 */
export type PickPhase =
  | { readonly kind: "idle"; readonly problem: PickProblem | undefined }
  | { readonly kind: "testing"; readonly slow: boolean }
  | { readonly kind: "confirm"; readonly testId: string; readonly fingerprint: string | undefined }
  | { readonly kind: "saving" };

/** What the screen shows, read each time through {@link PickModel.state}. */
export interface PickState {
  readonly option: PickOption;
  readonly provider: FirstRunKeyProvider;
  /** Whether a key is saved for `provider` and the person hasn't pressed Replace. */
  readonly usesSavedKey: boolean;
  /** Whether a key can be tested here at all; not in the browser demo. */
  readonly keysWork: boolean;
  readonly local: LocalState;
  /** The downloaded model the local option uses; `undefined` while there is none. */
  readonly localModel: string | undefined;
  /** The trust line's facts for the ticked choice; `undefined` for Sample answers or none known. */
  readonly line: ModelChoiceLine | undefined;
  readonly phase: PickPhase;
}

/** How the screen ended: Sample answers, or a real model whose choice was saved. */
export type PickDone =
  | { readonly kind: "sample" }
  | {
      readonly kind: "model";
      readonly changes: readonly ChoiceChange[];
      readonly trusted: boolean;
    };

/** What {@link PickModel} needs. */
export interface PickModelParts {
  /** The app's model choice; `undefined` in a window that can't test or save one. */
  readonly service: ModelChoiceService | undefined;
  /** Calls `callback` after `delayMs`; returns the way to cancel it. */
  readonly setTimer: (callback: () => void, delayMs: number) => () => void;
  /** Hears that the person continued. */
  readonly onDone: (done: PickDone) => void;
}

/** When the local test adds "Still loading…": a screen timer only, the test's own limit is 3 minutes. */
export const slowLoadMs = 30_000;

/** The model `ollama pull` fetches for the first run, preselected when it is downloaded (HAL-8722). */
export const smallLocalModel = "llama3.2";

/**
 * The Pick a model screen without its drawing (first-run-flow 3.3): the ticked option, the local
 * option's state, the one button and the trust line. Each test gets a request number, and an answer
 * for any other number is dropped, so a slow answer never replaces a newer state.
 *
 * @example
 * const model = new PickModel({ service, setTimer, onDone: (done) => openRun(done) });
 * await model.start();
 * model.subscribe(() => render(model.state));
 */
export class PickModel {
  readonly #parts: PickModelParts;
  readonly #listeners = new Set<() => void>();
  #state: PickState;
  #saved = new Set<FirstRunKeyProvider>();
  #replacing = false;
  /** Counts the presses and edits, so only the newest press may change the state. */
  #request = 0;
  /** Counts the trust line's reads, apart from the presses, so a press doesn't drop the line. */
  #lineRequest = 0;
  #stopTimer: (() => void) | undefined;

  constructor(parts: PickModelParts) {
    this.#parts = parts;
    const keysWork = parts.service !== undefined;
    this.#state = {
      option: keysWork ? "key" : "sample",
      provider: "anthropic",
      usesSavedKey: false,
      keysWork,
      local: keysWork ? { kind: "checking" } : { kind: "desktop-only" },
      localModel: undefined,
      line: undefined,
      phase: { kind: "idle", problem: undefined },
    };
  }

  get state(): PickState {
    return this.#state;
  }

  /** Calls `listener` after every change of {@link PickModel.state}; returns the way to stop. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Reads the saved keys and asks Ollama, then ticks the first option: the local one when Studio
   * found a model and no key is saved, the key option otherwise.
   */
  async start(): Promise<void> {
    const { service } = this.#parts;
    if (service === undefined) return;
    const saved = await Promise.all(firstRunKeyProviders.map((id) => service.keySaved(id)));
    this.#saved = new Set(firstRunKeyProviders.filter((_, index) => saved[index]));
    const provider = firstRunKeyProviders.find((id) => this.#saved.has(id)) ?? "anthropic";
    const local = await service.localModels();
    const found = local.kind === "one" || local.kind === "several";
    const option = found && this.#saved.size === 0 ? "local" : "key";
    this.#set({ provider, local, localModel: modelOf(local), option });
    await this.#readLine();
  }

  /** Ticks an option. The browser demo's key and local options can't be ticked. */
  choose(option: PickOption): void {
    if (option !== "sample" && !this.#state.keysWork) return;
    this.#edit({ option });
  }

  /** Picks the provider on the three-way switch. */
  pickProvider(provider: FirstRunKeyProvider): void {
    this.#replacing = false;
    this.#edit({ provider });
  }

  /** Replace: the key field shows for a provider that has a saved key. */
  replaceKey(): void {
    this.#replacing = true;
    this.#edit({});
  }

  /** Picks one of the downloaded models in the local option's picker. */
  pickLocalModel(model: string): void {
    this.#edit({ localModel: model });
  }

  /** Says the pasted key changed, which drops a problem or a passed test about the old one. */
  keyEdited(): void {
    if (this.#state.phase.kind === "idle" && this.#state.phase.problem === undefined) return;
    this.#edit({});
  }

  /**
   * The one button: Continue for Sample answers, Check again while no local model is found, and
   * Test and continue otherwise, with the pasted `key` (none uses the saved one).
   */
  async press(key: SecretText | undefined): Promise<void> {
    const { option, phase } = this.#state;
    if (phase.kind === "testing" || phase.kind === "saving") return;
    if (option === "sample") {
      this.#parts.onDone({ kind: "sample" });
      return;
    }
    if (phase.kind === "confirm") {
      await this.#continue(++this.#request, phase.testId, phase.fingerprint);
      return;
    }
    const choice = this.#choice();
    if (choice === undefined) {
      await this.checkAgain();
      return;
    }
    await this.#test(choice, this.#state.usesSavedKey ? undefined : key);
  }

  /** Asks Ollama again, for Check again. */
  async checkAgain(): Promise<void> {
    const { service } = this.#parts;
    if (service === undefined) return;
    const mine = ++this.#request;
    this.#set({ local: { kind: "checking" }, phase: { kind: "idle", problem: undefined } });
    const local = await service.localModels();
    if (mine !== this.#request) return;
    this.#set({ local, localModel: modelOf(local) });
    await this.#readLine();
  }

  /** Stops the slow-load timer and the listeners, when the screen closes. */
  dispose(): void {
    this.#request++;
    this.#stopTimer?.();
    this.#listeners.clear();
  }

  async #test(choice: ModelChoice, key: SecretText | undefined): Promise<void> {
    const service = this.#parts.service;
    if (service === undefined) return;
    const mine = ++this.#request;
    this.#set({ phase: { kind: "testing", slow: false } });
    if (choice.kind === "local") {
      this.#stopTimer = this.#parts.setTimer(() => {
        if (mine === this.#request) this.#set({ phase: { kind: "testing", slow: true } });
      }, slowLoadMs);
    }
    const tested = await service.test(choice, key);
    this.#stopTimer?.();
    // Only the newest press may change the screen: a late answer, passed or failed, is old news.
    if (mine !== this.#request || tested.kind === "superseded") return;
    await this.#tested(mine, choice, tested);
  }

  async #tested(
    mine: number,
    choice: ModelChoice,
    tested: Exclude<ModelChoiceTest, { kind: "superseded" }>,
  ): Promise<void> {
    if (tested.kind !== "tested" || tested.outcome !== "ok") {
      this.#set({ phase: { kind: "idle", problem: problemOfTest(choice, tested) } });
      return;
    }
    const preview = await this.#parts.service?.preview(tested.testId);
    if (mine !== this.#request) return;
    if (preview === undefined) {
      this.#set({ phase: { kind: "idle", problem: { kind: "changed", tone: "red" } } });
      return;
    }
    const line = { reaches: preview.reaches, localOnlyOff: preview.localOnlyOff };
    const { fingerprint } = preview;
    if (sameLine(line, this.#state.line)) {
      await this.#continue(mine, tested.testId, fingerprint);
      return;
    }
    // The line the person agreed to isn't what Continue would allow now: show it and ask again.
    this.#set({ line, phase: { kind: "confirm", testId: tested.testId, fingerprint } });
  }

  async #continue(mine: number, testId: string, fingerprint: string | undefined): Promise<void> {
    const service = this.#parts.service;
    if (service === undefined) return;
    this.#set({ phase: { kind: "saving" } });
    const saved = await service.continue(testId, fingerprint);
    if (mine !== this.#request) return;
    if (!saved.ok) {
      this.#set({ phase: { kind: "idle", problem: problemOfSave(saved) } });
      return;
    }
    this.#set({ phase: { kind: "idle", problem: undefined } });
    this.#parts.onDone({ kind: "model", changes: saved.changes, trusted: saved.trusted });
  }

  /** The ticked option as a choice to test; `undefined` for Sample answers or no local model. */
  #choice(): ModelChoice | undefined {
    const { option, provider, localModel } = this.#state;
    if (option === "key") return { kind: "key", provider };
    if (option === "local" && localModel !== undefined) return { kind: "local", model: localModel };
    return undefined;
  }

  /** A change the person made: it drops any answer still on its way, then reads the line again. */
  #edit(change: Partial<PickState>): void {
    this.#request++;
    this.#stopTimer?.();
    this.#set({ ...change, phase: { kind: "idle", problem: undefined } });
    void this.#readLine();
  }

  async #readLine(): Promise<void> {
    const mine = ++this.#lineRequest;
    const choice = this.#choice();
    const line = choice === undefined ? undefined : await this.#parts.service?.lineFacts(choice);
    if (mine === this.#lineRequest) this.#set({ line });
  }

  #set(change: Partial<PickState>): void {
    const next = { ...this.#state, ...change };
    const usesSavedKey = this.#saved.has(next.provider) && !this.#replacing;
    this.#state = { ...next, usesSavedKey };
    for (const listener of [...this.#listeners]) listener();
  }
}

/** The model the local option preselects: `llama3.2` when it is downloaded, else Ollama's first. */
function modelOf(local: LocalModels): string | undefined {
  if (local.kind === "one") return local.model;
  if (local.kind !== "several") return undefined;
  return local.models.includes(smallLocalModel) ? smallLocalModel : local.models[0];
}

function sameLine(a: ModelChoiceLine, b: ModelChoiceLine | undefined): boolean {
  if (b === undefined || a.localOnlyOff !== b.localOnlyOff) return false;
  const [x, y] = [a.reaches, b.reaches];
  if (x === undefined || y === undefined) return x === y;
  return x.name === y.name && x.secrets === y.secrets && x.host === y.host && x.local === y.local;
}
