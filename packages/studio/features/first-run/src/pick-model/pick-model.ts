import { type FirstRunKeyProvider, firstRunKeyProviders, type ModelChoice } from "@halonicjs/app";
import type { SecretText } from "@halonicjs/studio-kit";
import type { ModelChoiceLine, ModelChoiceService } from "../api.ts";
import {
  firstLocalModel,
  firstPicked,
  type LocalState,
  type PickMessage,
  type PickModelDone,
  type PickModelState,
  type PickOption,
  pickButton,
  pickedChoice,
  sameChoice,
  sameLine,
} from "./pick-model-state.ts";

/** How long a local test runs before the screen adds "Still loading…" (3.3); a screen timer only. */
export const slowLocalTestMs = 30_000;

/** What the Pick a model screen needs. */
export interface PickModelParts {
  /** The model choice of the open folder; `undefined` where there is none, such as the browser demo. */
  readonly service: ModelChoiceService | undefined;
  /** Calls `callback` after `delayMs`; returns a function that cancels it. */
  readonly setTimer: (callback: () => void, delayMs: number) => () => void;
  /** Called once the screen is done, to move the first run on. */
  readonly done: (result: PickModelDone) => void;
  /** Takes an error the service should never give, for the log. */
  readonly report: (error: unknown) => void;
}

/**
 * The Pick a model screen without its view (first-run-flow 3.3): which option
 * is ticked, what the one button does and what the test and Continue found.
 *
 * Only the answer to the newest request counts. Each test, line and check has
 * a request number, and an answer for an older number is dropped, so a late
 * failure from an earlier test never replaces what the screen shows now.
 *
 * @example
 * const pick = new PickModel({ service, setTimer, done: moveOn, report: console.error });
 * pick.subscribe(() => render(pick.state));
 * await pick.press(new SecretText(field.value));
 */
export class PickModel {
  readonly #parts: PickModelParts;
  readonly #listeners = new Set<() => void>();
  #state: PickModelState;
  /** Whether the person changed the options, so a late detection no longer moves the tick. */
  #touched = false;
  #keysKnown: boolean;
  #testRequest = 0;
  #lineRequest = 0;
  #checkRequest = 0;
  #stopSlowTimer: (() => void) | undefined;
  /** The passed test whose trust line changed, which the next Continue saves. */
  #confirm: { readonly testId: string; readonly fingerprint: string | undefined } | undefined;

  constructor(parts: PickModelParts) {
    this.#parts = parts;
    const keysOff = parts.service === undefined;
    const local: LocalState = keysOff ? { kind: "desktop-only" } : { kind: "checking" };
    this.#keysKnown = keysOff;
    const keySaved = new Set<FirstRunKeyProvider>();
    const picked = firstPicked(keysOff, local, keySaved);
    const start = { picked, provider: "anthropic" as const, keySaved, replacing: false, local };
    this.#state = {
      ...start,
      keysOff,
      localModel: undefined,
      line: undefined,
      busy: undefined,
      message: undefined,
      button: pickButton(start, false),
    };
    if (parts.service === undefined) return;
    void this.#askLine();
    void this.#start(parts.service);
  }

  get state(): PickModelState {
    return this.#state;
  }

  /** Calls `listener` after every change of {@link state}. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Ticks an option. An option that is off can't be ticked. */
  pick(option: PickOption): void {
    if (option === "key" && this.#state.keysOff) return;
    if (option === "local" && this.#state.local.kind === "desktop-only") return;
    this.#touched = true;
    this.#change({ picked: option });
  }

  /** Turns the provider switch. */
  chooseProvider(provider: FirstRunKeyProvider): void {
    this.#touched = true;
    this.#change({ provider, replacing: false });
  }

  /** Picks one of several downloaded models. */
  chooseLocalModel(model: string): void {
    this.#touched = true;
    this.#change({ localModel: model });
  }

  /** Replace: shows the key field for a provider whose key is saved. */
  replaceKey(): void {
    this.#change({ replacing: true });
  }

  /**
   * Presses the one button. `key` is the key field's text, used only when the
   * field shows; without it a provider's saved key is tested.
   */
  async press(key?: SecretText): Promise<void> {
    if (this.#state.busy !== undefined) return;
    const { button, picked } = this.#state;
    if (button === "check-again") return this.#checkLocal();
    if (picked === "sample") return this.#parts.done({ kind: "sample" });
    const confirm = this.#confirm;
    if (confirm !== undefined) {
      const request = this.#testRequest;
      return this.#continue(request, confirm.testId, confirm.fingerprint).catch((error: unknown) =>
        this.#broke(request, error),
      );
    }
    const choice = pickedChoice(this.#state);
    if (choice === undefined || this.#parts.service === undefined) return;
    const pasted =
      this.#state.keySaved.has(this.#state.provider) && !this.#state.replacing ? undefined : key;
    await this.#test(this.#parts.service, choice, pasted);
  }

  /** Stops the timers and drops every answer still to come, when the screen closes. */
  dispose(): void {
    this.#testRequest += 1;
    this.#lineRequest += 1;
    this.#checkRequest += 1;
    this.#stopSlowTimer?.();
    this.#listeners.clear();
  }

  async #start(service: ModelChoiceService): Promise<void> {
    const keys = Promise.all(
      firstRunKeyProviders.map(async (provider) =>
        (await service.keySaved(provider)) ? [provider] : [],
      ),
    ).then(
      (found) => this.#keysFound(new Set(found.flat())),
      (error: unknown) => {
        this.#parts.report(error);
        this.#keysFound(new Set());
      },
    );
    await Promise.all([keys, this.#checkLocal()]);
  }

  #keysFound(keySaved: ReadonlySet<FirstRunKeyProvider>): void {
    this.#keysKnown = true;
    const provider =
      firstRunKeyProviders.find((each) => keySaved.has(each)) ?? this.#state.provider;
    this.#change(
      this.#touched ? { keySaved } : { keySaved, provider, ...this.#firstTick(keySaved) },
    );
  }

  async #checkLocal(): Promise<void> {
    const service = this.#parts.service;
    if (service === undefined) return;
    const request = ++this.#checkRequest;
    this.#change({
      busy: this.#state.picked === "local" ? { kind: "checking" } : this.#state.busy,
    });
    const local: LocalState = await service.localModels().catch((cause: unknown) => {
      this.#parts.report(cause);
      return { kind: "not-found", cause } as const;
    });
    if (request !== this.#checkRequest) return;
    const busy = this.#state.busy?.kind === "checking" ? undefined : this.#state.busy;
    const tick = this.#touched ? {} : this.#firstTick(this.#state.keySaved, local);
    this.#change({ local, localModel: firstLocalModel(local), busy, ...tick });
  }

  /** The option ticked first, once both the saved keys and the detection are known. */
  #firstTick(
    keySaved: ReadonlySet<FirstRunKeyProvider>,
    local = this.#state.local,
  ): { picked?: PickOption } {
    if (!this.#keysKnown || local.kind === "checking") return {};
    return { picked: firstPicked(this.#state.keysOff, local, keySaved) };
  }

  async #test(
    service: ModelChoiceService,
    choice: ModelChoice,
    key: SecretText | undefined,
  ): Promise<void> {
    const request = ++this.#testRequest;
    const local = choice.kind === "local";
    this.#change({
      busy: local ? { kind: "loading-local", slow: false } : { kind: "testing-key" },
    });
    if (local) {
      this.#stopSlowTimer = this.#parts.setTimer(() => {
        if (request === this.#testRequest)
          this.#change({ busy: { kind: "loading-local", slow: true } });
      }, slowLocalTestMs);
    }
    try {
      const test = await service.test(choice, key);
      if (request !== this.#testRequest || test.kind === "superseded") return;
      if (test.kind !== "tested" || test.outcome !== "ok") return this.#stop(test);
      await this.#afterPass(service, request, test.testId);
    } catch (error) {
      this.#broke(request, error);
    }
  }

  /** The service failed, which it never should: the error goes to the log, the screen says try again. */
  #broke(request: number, error: unknown): void {
    if (request !== this.#testRequest) return;
    this.#parts.report(error);
    this.#stop({ kind: "broke" });
  }

  async #afterPass(service: ModelChoiceService, request: number, testId: string): Promise<void> {
    const preview = await service.preview(testId);
    if (request !== this.#testRequest) return;
    if (preview === undefined) return this.#stop({ kind: "broke" });
    if (!sameLine(preview, this.#state.line)) {
      this.#confirm = { testId, fingerprint: preview.fingerprint };
      return this.#stop({ kind: "line-changed" }, preview);
    }
    await this.#continue(request, testId, preview.fingerprint);
  }

  async #continue(request: number, testId: string, fingerprint: string | undefined): Promise<void> {
    const service = this.#parts.service;
    if (service === undefined) return;
    if (this.#state.busy === undefined) this.#set({ busy: { kind: "saving" } });
    const saved = await service.continue(testId, fingerprint);
    if (request !== this.#testRequest) return;
    this.#confirm = undefined;
    if (!saved.ok)
      return this.#stop({ kind: "not-saved", failed: saved.failed, keySaved: saved.keySaved });
    this.#stop(undefined);
    this.#parts.done({ kind: "saved", changes: saved.changes, trusted: saved.trusted });
  }

  /** Ends the wait with `message`, and with the line a passed test gave when it differs. */
  #stop(message: PickMessage | undefined, line?: ModelChoiceLine): void {
    this.#stopSlowTimer?.();
    this.#stopSlowTimer = undefined;
    this.#set({ busy: undefined, message, ...(line === undefined ? {} : { line }) });
  }

  /**
   * Changes what the person chose: the test under way, its message and any
   * changed line it found no longer count, and the trust line is asked again.
   */
  #change(changes: Partial<PickModelState>): void {
    const before = this.#state;
    this.#set(changes);
    const samePick = before.picked === this.#state.picked;
    if (samePick && sameChoice(pickedChoice(before), pickedChoice(this.#state))) return;
    this.#testRequest += 1;
    this.#confirm = undefined;
    this.#stopSlowTimer?.();
    const busy =
      this.#state.busy?.kind === "checking" && this.#state.picked === "local"
        ? this.#state.busy
        : undefined;
    this.#set({ busy, message: undefined, line: undefined });
    void this.#askLine();
  }

  async #askLine(): Promise<void> {
    const choice = pickedChoice(this.#state);
    const request = ++this.#lineRequest;
    if (choice === undefined || this.#parts.service === undefined) return;
    const line = await this.#parts.service.lineFacts(choice).catch((error: unknown) => {
      this.#parts.report(error);
      return undefined;
    });
    if (request === this.#lineRequest) this.#set({ line });
  }

  #set(changes: Partial<PickModelState>): void {
    const next = { ...this.#state, ...changes };
    this.#state = { ...next, button: pickButton(next, this.#confirm !== undefined) };
    for (const listener of this.#listeners) listener();
  }
}
