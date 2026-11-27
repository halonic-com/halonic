/**
 * The stepper run (`action-steppers.shell-run`): what the screen's buttons do once the desktop
 * app can run steps (HAL-17535). It runs each step through the `ActionSteps` app service, which
 * sends it with the user's own sign-in and records it, reads the request's record back to show
 * where each step stands, and answers the Inbox item through `AgentMessaging` once the stepper
 * ends. Every step is checked again first (HAL-17491 7.3). Once a `check` step has read today's
 * state, the request's `expect` is compared with it, and a difference stops the stepper before any
 * later step is sent (`action-steppers.expect-stop`). A check that names `changedAfterStart` is
 * done only once its time is later than the guided page's start
 * (`action-steppers.changed-after-start-run`). In a browser the service runs nothing, so the
 * screen stays in review mode and only **Decline** answers.
 */
import type { SignInPhase } from "@halonicjs/action-steppers";
import type { ActionKeptValue, ActionOutcome } from "@halonicjs/events";
import type { AnswerResult, InboxAnswer, MessagingSource } from "@halonicjs/ports";
import type { ActionSteps } from "@halonicjs/studio-services";
import { checkPastedResult } from "../pasted-result.ts";
import {
  type ActionItem,
  type ActionReviewContext,
  reviewActionItem,
} from "../review/action-item-review.ts";
import {
  isDone,
  nextStep,
  type StepperActions,
  type StepperStage,
  type StepperView,
} from "../stepper-view.ts";
import {
  answeredAsChanged,
  unchangedChecks,
  withJudgement,
  withPagesToReopen,
} from "./changed-after-start.ts";
import { gateRefusal, stoppedByChecks } from "./check-gate.ts";
import { checkedValues } from "./expect-stop.ts";
import {
  answerDay,
  foldRecord,
  type RecordState,
  resultAnswer,
  stepOutcome,
  stoppedOutcome,
} from "./record-fold.ts";
import { SignInRun, type StepperSignIn } from "./sign-in-run.ts";
import { endedStage, signInStage } from "./stages.ts";
import { setsSecret, stepRequest } from "./step-request.ts";

/** What a {@link StepperRun} checks against, runs with and answers through. */
export interface StepperRunOptions {
  readonly item: ActionItem;
  /** The item's source as `AgentMessaging` lists it, which the requester policy keys on. */
  readonly source: MessagingSource | undefined;
  readonly catalog: ActionReviewContext["catalog"];
  readonly policy: ActionReviewContext["policy"];
  readonly steps: ActionSteps;
  /** Answers the item through `AgentMessaging`, once. */
  readonly answer: (answer: InboxAnswer) => Promise<AnswerResult>;
  /** The clock for expiry and for the day a secret was set. */
  readonly now: () => Date;
  /** Runs a definition's `sign-in` steps; without it, such a request can't run here. */
  readonly serviceSignIn?: StepperSignIn | undefined;
}

/**
 * One open action request, from review to answer. The screen draws {@link current} and calls
 * {@link actions}; when a callback fails, {@link failure} says why and {@link retry} does it again.
 */
export class StepperRun {
  /** The request's id in its record: the item's, within its source. */
  readonly request: string;
  private view: StepperView;
  private readonly listeners = new Set<() => void>();
  private busy = false;
  /** The request's record as {@link refresh} read it last, for the stop after a check. */
  private record: RecordState | undefined;
  private signingIn = false;
  /** How this run ended, for a Studio that keeps no record, such as one in a browser. */
  private endedWith: ActionOutcome | undefined;
  private readonly options: StepperRunOptions;
  /** The request's sign-in steps, when its definition has any and this Studio can run them. */
  private readonly signInRun: SignInRun | undefined;

  constructor(view: StepperView, options: StepperRunOptions) {
    this.options = options;
    this.view = view;
    this.request = `${options.item.source}/${options.item.id}`;
    this.signInRun = signInRunOf(view, options);
  }

  /** What the screen shows now. */
  current = (): StepperView => this.view;

  /** Goes up on every change, the view's or the failure's, so the card draws again. */
  changes = (): number => this.changeCount;

  private changeCount = 0;

  /** Calls `listener` whenever {@link current} changes; returns the call that stops it. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The screen's callbacks. */
  readonly actions: StepperActions = {
    runStep: (number) => void this.guard(() => this.run(number)),
    runAll: () => void this.guard(() => this.runAll()),
    decline: () => void this.guard(() => this.end("stopped")),
    openPage: (address) => void this.guard(() => this.openPage(address)),
    confirmBrowserStep: (number, result) => void this.guard(() => this.confirm(number, result)),
    // No step has a by-hand check yet (`hasCheck` is always false), so none offers it. A
    // definition's own `check` step is a step of its own and runs through `runStep`.
    checkStep: () => {},
    markDoneByHand: (number) => void this.guard(() => this.confirm(number)),
    signIn: () => void this.guard(() => this.signIn()),
    signInAgain: () => void this.guard(() => this.signInAgain()),
  };

  /**
   * Reads the request's record and the user's sign-in, so a request opened again resumes. A stop
   * the last run found but didn't answer, say because the window closed in between, ends it now.
   */
  open = async (): Promise<void> => {
    await this.refresh();
    if (this.view.stage.kind === "changed") await this.end("failed");
  };

  /** Stops a sign-in this run started, when the screen closes. */
  async close(): Promise<void> {
    if (this.signingIn) await this.options.steps.cancelSignIn();
    await this.signInRun?.close();
  }

  /** The last failure of a callback, for the card's line; cleared by the next one that works. */
  failure: unknown;
  /** What failed last, so **Try again** does it again. */
  private failed: (() => Promise<void>) | undefined;

  /** Does the callback that failed last again; nothing when the last one worked. */
  retry = (): void => {
    const work = this.failed;
    if (work !== undefined) void this.guard(work);
  };

  /** Keeps a failure from outside the callbacks, such as reading the record when the card opens. */
  fail(error: unknown): void {
    this.failure = error;
    this.failed = () => this.refresh();
    this.emit();
  }

  /** Settles once the callback the screen called last has finished, for tests and the card. */
  idle(): Promise<void> {
    return this.last;
  }

  private last: Promise<void> = Promise.resolve();

  private guard(work: () => Promise<void>): Promise<void> {
    this.last = this.attempt(work);
    return this.last;
  }

  private async attempt(work: () => Promise<void>): Promise<void> {
    try {
      await work();
      this.failure = undefined;
      this.failed = undefined;
    } catch (error) {
      this.failure = error;
      this.failed = work;
    }
    this.emit();
  }

  private set(view: StepperView): void {
    this.view = view;
    this.emit();
  }

  private emit(): void {
    this.changeCount += 1;
    for (const listener of this.listeners) listener();
  }

  /** Checks the item again and rebuilds the view from the record and the sign-in. */
  private async refresh(): Promise<void> {
    const { item, source, catalog, policy, steps, now } = this.options;
    const review = reviewActionItem(item, source, { catalog, policy, now: now() });
    if (review.kind === "unreadable")
      return this.set({ ...this.view, stage: { kind: "not-available" } });
    const reviewed = review.view;
    if (this.endedWith !== undefined && !steps.canRun) {
      return this.set({ ...reviewed, stage: endedStage(this.endedWith) });
    }
    // Expired and blocked requests can't run, and outside the desktop app nothing can.
    if (reviewed.stage.kind !== "desktop-only" || !steps.canRun) return this.set(reviewed);
    const history = await steps.history(this.request);
    const record = foldRecord(history);
    this.record = record;
    const current = checkedValues(this.definition(), record);
    const unchanged = unchangedChecks(this.definition(), history);
    const shown = withJudgement(
      this.withRecord(current === undefined ? reviewed : this.review(current), record),
      unchanged,
    );
    const stopped = stoppedByChecks(shown, { catalog, action: item.action, current, record });
    if (stopped !== undefined) return this.set(stopped);
    if (record.finished !== undefined) {
      const ended = { ...shown, stage: endedStage(record.finished) };
      return this.set(hasSignIn(reviewed) ? this.withSignIn(ended, ended.stage) : ended);
    }
    // A sign-in step is the sign-in: it needs no account first, only a Studio that can run it.
    if (hasSignIn(reviewed)) return this.set(this.withSignIn(shown));
    const account = await steps.account(reviewed.service);
    const stage =
      account === undefined ? signInStage(reviewed.service, null) : { kind: "ready" as const };
    const view = { ...shown, account: account?.name ?? null, stage };
    // Only a request that can still run offers a page again; a stopped or ended one doesn't.
    this.set(stage.kind === "ready" ? withPagesToReopen(view, unchanged) : view);
  }

  /** The request's definition; the review found it, or the run would have stopped there. */
  private definition() {
    const { item, catalog } = this.options;
    const definition = catalog.definition(item.action.definition, item.action.version);
    if (definition === undefined) throw new Error("The request's definition went away.");
    return definition;
  }

  /** The review again, with today's state from the checks, so each preview sets it next to the change. */
  private review(current: Readonly<Record<string, ActionKeptValue>>): StepperView {
    const { item, source, catalog, policy, now } = this.options;
    const review = reviewActionItem(item, source, { catalog, policy, now: now(), current });
    if (review.kind === "unreadable") throw new Error("The request can't be read anymore.");
    return review.view;
  }

  /** The view with each step's outcome from the record. */
  private withRecord(view: StepperView, record: RecordState): StepperView {
    const steps = view.steps.map((step) => ({
      ...step,
      outcome: stepOutcome(record.steps.get(step.number)),
    }));
    return { ...view, steps };
  }

  /**
   * Does `work` while nothing else does, and reads the record back afterwards whatever happened.
   * Returns whether it ran, so a second click while a step runs does nothing.
   */
  private async alone(work: () => Promise<void>): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      await work();
    } finally {
      this.busy = false;
      await this.refresh();
    }
    return true;
  }

  /** Runs or opens one step, if the request is still ready after a fresh check. */
  private async run(number: number): Promise<void> {
    const { item, catalog, steps } = this.options;
    const ran = await this.alone(async () => {
      await this.refresh();
      if (this.view.stage.kind !== "ready") return;
      const action = this.view.steps.find((step) => step.number === number)?.action;
      if (action?.kind === "sign-in") return this.runSignInPart(number, action.phase);
      const route = catalog.route(item.action.definition, item.action.version, number);
      if (route === undefined) return;
      if (this.record === undefined) return;
      // A check before it hasn't run, or kept something it shouldn't have: send nothing, and say
      // why on the card, as a refused pasted result does.
      const refusal = this.refusal(number, this.record);
      if (refusal !== undefined) throw new Error(refusal);
      this.markRunning(number);
      const request = stepRequest(item.action, route);
      if (route.kind === "call") await steps.runStep(this.request, request);
      else await steps.openGuidedStep(this.request, request);
    });
    if (ran) await this.endIfDone();
  }

  /** Runs one part of the sign-in, and records the parts it says the record may now keep. */
  private async runSignInPart(number: number, phase: SignInPhase): Promise<void> {
    if (this.signInRun === undefined) return;
    this.markRunning(number);
    const parts = await this.signInRun.run(phase);
    for (const step of this.view.steps) {
      if (step.action.kind === "sign-in" && parts.includes(step.action.phase)) {
        await this.options.steps.confirmStep(this.request, step.number);
      }
    }
  }

  /** The view of a request with sign-in steps: each part as this window has it, and the panel. */
  private withSignIn(view: StepperView, stage: StepperStage = { kind: "ready" }): StepperView {
    const signIn = this.signInRun;
    if (signIn === undefined) return { ...view, stage: { kind: "not-available" } };
    const steps = view.steps.map((step) =>
      step.action.kind === "sign-in"
        ? { ...step, outcome: signIn.outcome(step.action.phase, step.outcome) }
        : step,
    );
    return { ...view, steps, stage, serviceSignIn: signIn.panel() };
  }

  /** Why step `number` can't run after the checks before it, or `undefined`. */
  private refusal(number: number, record: RecordState): string | undefined {
    const { catalog, item } = this.options;
    const gate = gateRefusal(catalog, item.action, number, record);
    return gate.ok ? undefined : gate.message;
  }

  private markRunning(number: number): void {
    const running = { kind: "running" } as const;
    const shown = this.view.steps.map((step) =>
      step.number === number ? { ...step, outcome: running } : step,
    );
    this.set({ ...this.view, steps: shown });
  }

  /**
   * Runs the call steps still to do, in order, and stops at the first that doesn't succeed, or
   * once the request can't run anymore, such as when a check found the state changed.
   */
  private async runAll(): Promise<void> {
    for (const step of this.view.steps) {
      if (this.view.stage.kind !== "ready") return;
      if (isDone(step)) continue;
      if (step.action.kind !== "call") return;
      await this.run(step.number);
      const after = this.view.steps.find((each) => each.number === step.number);
      if (after === undefined || !isDone(after)) return;
    }
  }

  /** Opens the page of the browser step that shows `address`; the step waits for the user's word. */
  private async openPage(address: string): Promise<void> {
    const step = this.view.steps.find(
      (each) => each.action.kind === "browser" && each.action.address === address && !isDone(each),
    );
    if (step !== undefined) await this.run(step.number);
  }

  /**
   * Records a step the user did on the page or by hand, with the result they pasted back as its
   * `kept.result`, and ends the request if it was the last. The pasted result is checked again
   * here (`action-steppers.pasted-result`), so one the screen should have refused records nothing.
   */
  private async confirm(number: number, pasted?: string): Promise<void> {
    const ran = await this.alone(async () => {
      await this.refresh();
      if (this.view.stage.kind !== "ready") return;
      const kept = this.keptResult(number, pasted);
      checkKeptFields(kept, this.keptFieldsOf(number));
      await this.options.steps.confirmStep(this.request, number, kept);
    });
    if (ran) await this.endIfDone();
  }

  /** The fields a step may keep when the user confirms it: `result`, if it asks for one. */
  private keptFieldsOf(number: number): readonly string[] {
    const action = this.view.steps.find((step) => step.number === number)?.action;
    return action?.kind === "browser" && action.resultLabel !== undefined ? ["result"] : [];
  }

  /** A browser step's pasted result as its kept field; throws, never naming the value, if refused. */
  private keptResult(number: number, pasted: string | undefined): { result: string } | undefined {
    const action = this.view.steps.find((step) => step.number === number)?.action;
    if (pasted === undefined || action?.kind !== "browser" || action.resultLabel === undefined) {
      return undefined;
    }
    const checked = checkPastedResult(pasted, action.resultPattern);
    if (checked.kind === "refused") {
      throw new Error(`The pasted result wasn't kept (${checked.reason}).`);
    }
    return checked.kind === "kept" ? { result: checked.value } : undefined;
  }

  /** Ends the request once every step is done, or as failed once a check found the state changed. */
  private async endIfDone(): Promise<void> {
    if (this.view.stage.kind === "changed") await this.end("failed");
    else if (this.view.stage.kind === "ready" && this.view.steps.every(isDone)) {
      await this.end("succeeded");
    }
  }

  /**
   * Answers the item with the folded result, then records the end, so nothing of it runs again.
   * When the user stops it (`stopped`), it ends `declined` if nothing ran and `failed` if some
   * steps did, since a declined answer lists no steps. A request stopped by a changed state
   * names the step it didn't send. A request whose record says it ended already is left as it is.
   */
  private async end(outcome: ActionOutcome | "stopped"): Promise<void> {
    const { item, catalog, steps, answer, now } = this.options;
    const { definition, version } = item.action;
    await this.alone(async () => {
      const history = await steps.history(this.request);
      const record = foldRecord(history);
      // Ended already, here or in another window: it has had its answer, so it gets no second one.
      if (record.finished !== undefined) return;
      const ended = outcome === "stopped" ? stoppedOutcome(record) : outcome;
      const secretSteps = new Set(
        this.view.steps
          .map((step) => step.number)
          .filter((number) => setsSecret(catalog.route(definition, version, number))),
      );
      const changedAt =
        this.view.stage.kind === "changed" ? nextStep(this.view)?.number : undefined;
      const stateChanged = answeredAsChanged(
        unchangedChecks(this.definition(), history),
        changedAt,
      );
      const day = answerDay(now());
      const result = await answer(resultAnswer(record, ended, secretSteps, day, stateChanged));
      if (result.outcome === "refused") throw new Error(`The answer was refused: ${result.reason}`);
      // Answered here or, first, elsewhere: either way this request has had its answer.
      await steps.finish(this.request, ended);
      this.endedWith = ended;
    });
  }

  private async signIn(): Promise<void> {
    const service = this.view.service;
    this.signingIn = true;
    try {
      await this.options.steps.signIn(this.request, service, (code) =>
        this.set({ ...this.view, stage: signInStage(service, code.code) }),
      );
    } finally {
      this.signingIn = false;
      await this.refresh();
    }
  }

  private async signInAgain(): Promise<void> {
    await this.options.steps.signOut(this.view.service);
    await this.signIn();
  }
}

/** Whether the request's definition has `sign-in` steps. */
function hasSignIn(view: StepperView): boolean {
  return view.steps.some((step) => step.action.kind === "sign-in");
}

/**
 * The run of a request's sign-in steps, from its checked parameters: the connection file's name,
 * the host the request names, and whether it is a test sign-in.
 */
function signInRunOf(view: StepperView, options: StepperRunOptions): SignInRun | undefined {
  if (options.serviceSignIn === undefined || !hasSignIn(view)) return undefined;
  const { parameters } = options.item.action;
  const ref = {
    service: "paperclip",
    connection: String(parameters["connection"]),
    host: String(parameters["host"]),
  } as const;
  return new SignInRun(options.serviceSignIn, ref, parameters["mode"] === "test", options.now);
}

/**
 * Refuses a kept field the step doesn't keep, so a stray field never reaches the record. The
 * error names the field, never its value.
 */
function checkKeptFields(
  kept: Readonly<Record<string, string>> | undefined,
  allowed: readonly string[],
): void {
  const stray = Object.keys(kept ?? {}).find((field) => !allowed.includes(field));
  if (stray !== undefined) throw new Error(`The step doesn't keep a field named "${stray}".`);
}
