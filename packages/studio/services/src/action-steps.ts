import type { ActionUserCode } from "@halonicjs/adapter-action-send-tauri";
import type { ActionKeptValue, ActionOutcome, ActionRecordEvent } from "@halonicjs/events";
import type {
  ActionAccount,
  ActionOpenResult,
  ActionRecords,
  ActionSender,
  ActionSendRequest,
  ActionSendResult,
  ActionService,
  ActionSignInResult,
  ActionStepRef,
} from "@halonicjs/ports";

/**
 * Nothing ran: a step runs only in the desktop app, which holds the
 * sign-in. The stepper screen says "Open it in the desktop app to run it."
 */
export interface DesktopOnly {
  outcome: "desktop-only";
}

/** Nothing ran: the request's record already has its `action.finished`, so it never runs again. */
export interface RequestClosed {
  outcome: "closed";
}

/** What running a call step did. */
export type ActionStepResult = ActionSendResult | DesktopOnly | RequestClosed;

/** What opening a guided step's page did. */
export type ActionPageResult = ActionOpenResult | DesktopOnly | RequestClosed;

/** The request's record took the event. */
export interface Recorded {
  outcome: "recorded";
}

/** What recording a step the stepper didn't send, or the request's end, did. */
export type ActionRecordResult = Recorded | DesktopOnly | RequestClosed;

/**
 * The app service the stepper screen calls to run a request's steps with
 * the user's own sign-in (requirement `services.action-steps`). It
 * runs a step through the `ActionSender` and writes what happened to the
 * request's record, through `ActionRecords`. Every call comes from the
 * user's click; agents only file requests and never reach it.
 */
export interface ActionSteps {
  /** Whether this Studio can run steps at all: `false` outside the desktop app. */
  readonly canRun: boolean;
  /** The account signed in to the service, or `undefined` when nobody is. */
  account(service: ActionService): Promise<ActionAccount | undefined>;
  /** Signs in to the service for `request`, showing the device code with `showCode`, and records who. */
  signIn(
    request: string,
    service: ActionService,
    showCode: (code: ActionUserCode) => void,
  ): Promise<ActionSignInResult | DesktopOnly>;
  /** Cancels a sign-in this page started, for example when the stepper closes. */
  cancelSignIn(): Promise<void>;
  /** Forgets the service's sign-in. */
  signOut(service: ActionService): Promise<void>;
  /** Runs one call step of `request`, and records that it started and how it ended. */
  runStep(request: string, step: ActionSendRequest): Promise<ActionStepResult>;
  /** Opens one guided step's page of `request`, and records that it started, or that it was refused. */
  openGuidedStep(request: string, step: ActionStepRef): Promise<ActionPageResult>;
  /**
   * Records that the user did step `step` themselves, on the page a guided step opened or by
   * hand, with what they pasted back as `kept` (never a secret). Nothing was sent, so the event
   * has no status.
   */
  confirmStep(
    request: string,
    step: number,
    kept?: Readonly<Record<string, ActionKeptValue>>,
  ): Promise<ActionRecordResult>;
  /** Records that a check showed step `step` was done already, so it wasn't sent. */
  skipStep(request: string, step: number): Promise<ActionRecordResult>;
  /** Records how the request ended: after this, nothing of it runs or is recorded again. */
  finish(request: string, outcome: ActionOutcome): Promise<ActionRecordResult>;
  /** The request's record, oldest first, so a request opened again resumes where it stopped. */
  history(request: string): Promise<readonly ActionRecordEvent[]>;
}

/** The sender the desktop app gives: the port, plus the device code and the cancel a sign-in needs. */
export interface StepSender extends ActionSender {
  signIn(
    service: ActionService,
    showCode?: (code: ActionUserCode) => void,
  ): Promise<ActionSignInResult>;
  cancelSignIn(): Promise<void>;
}

/** What {@link createActionSteps} runs steps with. */
export interface ActionStepsOptions {
  sender: StepSender;
  records: ActionRecords;
  /** The time each record event gets. */
  now: () => Date;
}

/**
 * The desktop app's {@link ActionSteps}. A request whose record has its
 * `action.finished` runs nothing more. A step the user cancels in the
 * shell's dialog, or one the shell fails to run, leaves only its
 * `action.step.started`, so the stepper can offer it again.
 *
 * @example
 * const steps = createActionSteps({ sender, records, now: () => new Date() });
 * await steps.runStep("req-1", { definition: "github.approve-run", version: 1, step: 2, placeholders });
 */
export function createActionSteps(options: ActionStepsOptions): ActionSteps {
  const { sender, records, now } = options;
  const at = () => now().toISOString();
  const isClosed = async (request: string) =>
    (await records.read(request)).some((event) => event.type === "action.finished");
  return {
    canRun: true,
    account: (service) => sender.account(service),
    async signIn(request, service, showCode) {
      const result = await sender.signIn(service, showCode);
      if (result.outcome === "signed-in") {
        const { name } = result.account;
        await records.append({
          type: "action.signed-in",
          request,
          at: at(),
          service,
          account: name,
        });
      }
      return result;
    },
    cancelSignIn: () => sender.cancelSignIn(),
    signOut: (service) => sender.signOut(service),
    async runStep(request, step) {
      if (await isClosed(request)) return { outcome: "closed" };
      await records.append({ type: "action.step.started", request, at: at(), step: step.step });
      const result = await sender.send(step);
      const ended = endOf(result, { request, at: at(), step: step.step });
      if (ended !== undefined) await records.append(ended);
      return result;
    },
    history: (request) => records.read(request),
    async confirmStep(request, step, kept = {}) {
      if (await isClosed(request)) return { outcome: "closed" };
      await records.append({ type: "action.step.succeeded", request, at: at(), step, kept });
      return recorded;
    },
    async skipStep(request, step) {
      if (await isClosed(request)) return { outcome: "closed" };
      await records.append({ type: "action.step.skipped", request, at: at(), step });
      return recorded;
    },
    async finish(request, outcome) {
      if (await isClosed(request)) return { outcome: "closed" };
      await records.append({ type: "action.finished", request, at: at(), outcome });
      return recorded;
    },
    async openGuidedStep(request, step) {
      if (await isClosed(request)) return { outcome: "closed" };
      const result = await sender.openGuided(step);
      await records.append({ type: "action.step.started", request, at: at(), step: step.step });
      if (result.outcome === "refused") {
        const failed = { request, at: at(), step: step.step, failure: "refused" } as const;
        await records.append({ type: "action.step.failed", ...failed });
      }
      return result;
    },
  };
}

/** The event a send ends a step with; `undefined` when the user cancelled and nothing was sent. */
function endOf(
  result: ActionSendResult,
  base: { request: string; at: string; step: number },
): ActionRecordEvent | undefined {
  switch (result.outcome) {
    case "answered":
      return answeredEvent(result, base);
    case "refused":
    case "unreachable":
      return { type: "action.step.failed", ...base, failure: result.outcome };
    case "cancelled":
      return undefined;
  }
}

function answeredEvent(
  result: Extract<ActionSendResult, { outcome: "answered" }>,
  base: { request: string; at: string; step: number },
): ActionRecordEvent {
  const { status, kept, error } = result;
  // A check that found more than one match failed, whatever its status; Studio words it itself.
  if (result.unusable === "more-than-one") {
    return { type: "action.step.failed", ...base, failure: "more-than-one", status };
  }
  if (status >= 200 && status < 300) {
    return { type: "action.step.succeeded", ...base, status, kept };
  }
  const failed: ActionRecordEvent = {
    type: "action.step.failed",
    ...base,
    failure: "service-error",
    status,
  };
  if (error !== undefined) failed.error = error;
  return failed;
}

const recorded: Recorded = { outcome: "recorded" };

const desktopOnly: DesktopOnly = { outcome: "desktop-only" };

/**
 * The {@link ActionSteps} of a Studio outside the desktop app, such as the
 * one the computer serves to a browser: it has no sign-in, so it runs
 * nothing, writes nothing, and answers every run and record with `desktop-only`.
 */
export const desktopOnlyActionSteps: ActionSteps = {
  canRun: false,
  account: () => Promise.resolve(undefined),
  signIn: () => Promise.resolve(desktopOnly),
  cancelSignIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  runStep: () => Promise.resolve(desktopOnly),
  openGuidedStep: () => Promise.resolve(desktopOnly),
  confirmStep: () => Promise.resolve(desktopOnly),
  skipStep: () => Promise.resolve(desktopOnly),
  finish: () => Promise.resolve(desktopOnly),
  history: () => Promise.resolve([]),
};
