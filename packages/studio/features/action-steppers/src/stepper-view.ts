/**
 * The action stepper's view model: what the screen shows for one action request. It's local to
 * this feature on purpose, so the screen can be built before `core/action-steppers` lands; a later
 * pull request fills it from that package and the app service (HAL-17488). The screen only draws it
 * and calls back; the few rules it needs are the pure functions at the end of this file.
 */

/** How much harm a step can do: `routine`, an `admin` change, or `irreversible`. */
export type StepRisk = "routine" | "admin" | "irreversible";

/**
 * The catalog's id of the service a request's steps go to, such as `github` or `cloudflare`, which
 * decides how the user signs in. The words name the ones they know and show any other id as it is.
 */
export type StepperService = string;

/** One HTTP call, exactly as the user's client will send it, for "Show the request". */
export interface StepCall {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly address: string;
  /** The JSON body as it will be sent, or `undefined` when the call has none. */
  readonly body?: string | undefined;
}

/**
 * Where a step stands. `skipped` is a step a check showed was done already; `by-hand` is one the
 * user marked done by hand, with what its check found, or `null` when it has no check.
 */
export type StepOutcome =
  | { readonly kind: "pending" }
  | { readonly kind: "running" }
  | { readonly kind: "succeeded"; readonly result?: string | undefined }
  | {
      readonly kind: "failed";
      /** The service's HTTP status, or `undefined` when it never answered or nothing was sent. */
      readonly status?: number | undefined;
      readonly message: string;
    }
  | { readonly kind: "skipped" }
  | { readonly kind: "by-hand"; readonly checked: string | null };

/**
 * A step's manual form (HAL-17491 7.8): the page that does the same thing, what to do there, what
 * to paste back and how to see it worked. Built from the same definition the stepper runs.
 */
export interface ManualForm {
  readonly address?: string | undefined;
  readonly lines: readonly string[];
  readonly check?: string | undefined;
}

/**
 * Where a browser step's instructions come from: a library step, checked against the real page on
 * a date, or the requester's own words, which Halonic never checked (HAL-17491 7.1).
 */
export type InstructionsSource =
  | { readonly kind: "library"; readonly checkedOn: Date }
  | { readonly kind: "requester" };

/**
 * What a step does: an API call the desktop app makes, a page the user works on in the browser, a
 * value only the user gives, or an API step whose exact call comes from its reviewed script once
 * ToolScript lands (HAL-17491 7.9); until then the review names the script.
 */
export type StepAction =
  | { readonly kind: "call"; readonly call: StepCall }
  | { readonly kind: "script"; readonly script: string }
  /** A part of the service's own sign-in, run in the desktop app (HAL-17491 row 15). */
  | { readonly kind: "sign-in"; readonly phase: "start" | "approve" | "keep" | "test" }
  | {
      readonly kind: "input";
      readonly label: string;
      /** Typed into the desktop app's secure field, never into the page (HAL-17491 1.2). */
      readonly secret: boolean;
    }
  | {
      readonly kind: "browser";
      /** The full address that will open, as the shell checked it. */
      readonly address: string;
      readonly instructions: readonly string[];
      readonly source: InstructionsSource;
      /** The label of the optional "paste the result here" field. Never a secret. */
      readonly resultLabel?: string | undefined;
      /** The anchored pattern (`^…$`) the whole pasted result must match before it's kept. */
      readonly resultPattern?: string | undefined;
    };

/** One step of the request, in plain words, with what it does and where it stands. */
export interface StepView {
  /** Counted from 1, as the screen says it: "Run step 2 of 3". */
  readonly number: number;
  /** The definition's plain-language preview of the step. */
  readonly preview: string;
  readonly risk: StepRisk;
  readonly action: StepAction;
  readonly manual: ManualForm;
  /** Whether the step has a check that can confirm it was done, by the stepper or by hand. */
  readonly hasCheck: boolean;
  readonly outcome: StepOutcome;
}

/** One thing the request touches (HAL-17491 7.3): a service's exact target, or a page it opens. */
export type StepperTouch =
  | { readonly kind: "target"; readonly service: string; readonly target: string }
  | { readonly kind: "page"; readonly address: string };

/** Who asked, as the messaging source says it: the agent's name and where it runs. */
export interface StepperRequester {
  readonly name: string;
  /** The source's label, such as "Paperclip · Acme". */
  readonly source: string;
}

/** How the user signs in to the request's service, when the stepper has no token for it yet. */
export type StepperSignIn =
  | {
      readonly service: "github";
      /**
       * The device code GitHub gave, for the user to type on the page the shell opened; `null`
       * until the user starts the sign-in, which only a click may do (HAL-17491 3.1).
       */
      readonly code: string | null;
    }
  | {
      readonly service: "cloudflare";
      /** The token's permission groups and resources, one line each: "Zone · DNS · Edit, on zone acme.example only". */
      readonly permissions: readonly string[];
    };

/** One value the request expected that its check read differently today. */
export interface StepperChange {
  readonly name: string;
  /** What the requester saw when they asked. */
  readonly expected: string | number | boolean;
  /** What the check read today, or `undefined` when it read nothing for that name. */
  readonly current: string | number | boolean | null | undefined;
}

/**
 * What the screen as a whole shows besides the request. `ready` is the review and the run, step
 * by step; the others say why nothing (more) can run. `blocked` is a request the user's requester
 * policy doesn't let run (HAL-17491 6.5). `changed` is a request whose check read a state other
 * than the one the requester saw, so none of its later steps runs (HAL-17491 6.2).
 */
export type StepperStage =
  | { readonly kind: "ready" }
  | { readonly kind: "sign-in"; readonly signIn: StepperSignIn }
  | { readonly kind: "missing-permission"; readonly permission: string }
  | { readonly kind: "declined" }
  | { readonly kind: "expired" }
  | { readonly kind: "not-available" }
  | { readonly kind: "desktop-only" }
  | { readonly kind: "blocked" }
  | {
      readonly kind: "changed";
      /** "This changed since the request: …", naming the changed values, never quoting them. */
      readonly message: string;
      /** Each changed value, which the screen shows apart from the sentence, as data. */
      readonly changes: readonly StepperChange[];
    }
  | { readonly kind: "finished" };

/** One action request as the stepper shows it. */
export interface StepperView {
  /** The definition's title, filled from the checked parameters: "Approve the deployment of acme/app to release". */
  readonly title: string;
  readonly service: StepperService;
  /** The account the user's token belongs to, or `null` before they sign in. */
  readonly account: string | null;
  /** Every service target the steps change and every page they open, before anything runs. */
  readonly touches: readonly StepperTouch[];
  /** The request's highest step risk. */
  readonly risk: StepRisk;
  readonly expiresAt: Date;
  readonly requester: StepperRequester;
  /** The requester's own words. Untrusted: always shown as plain, quoted text. */
  readonly reason: string;
  /** Empty when the installed Halonic doesn't know the request's definition. */
  readonly steps: readonly StepView[];
  /** The service's API is down: the screen says so, and the whole manual guide opens by itself. */
  readonly serviceDown: boolean;
  readonly stage: StepperStage;
}

/** What the screen calls back. The owner of the view model does the work and updates the view. */
export interface StepperActions {
  /** Runs one API step. For an `irreversible` step only after the user confirmed it. */
  readonly runStep: (number: number) => void;
  /** Runs every step still to do, in order. Only offered when {@link canRunAll} is true. */
  readonly runAll: () => void;
  readonly decline: () => void;
  /** Asks the desktop shell to open a page; the shell checks the address against its list. */
  readonly openPage: (address: string) => void;
  /** The user says a browser step is done, with what they pasted back, if it asks for anything. */
  readonly confirmBrowserStep: (number: number, result: string | undefined) => void;
  /**
   * The user did a step by hand and it has a check that confirms it (HAL-17491 7.8). Not a
   * definition's own `check` step, which runs through {@link runStep} like any other step.
   */
  readonly checkStep: (number: number) => void;
  /** The user did a step by hand and it has no check: record it as not checked. */
  readonly markDoneByHand: (number: number) => void;
  /** Opens GitHub's device page from a click, or the shell's native dialog for a Cloudflare token. */
  readonly signIn: () => void;
  /** Starts the service's sign-in again, with another account or more permissions. */
  readonly signInAgain: () => void;
}

/** Whether a step needs nothing more: it succeeded, was done already, or was done by hand. */
export function isDone(step: StepView): boolean {
  const kind = step.outcome.kind;
  return kind === "succeeded" || kind === "skipped" || kind === "by-hand";
}

/** The step to do next, or `undefined` when none is left. */
export function nextStep(view: StepperView): StepView | undefined {
  return view.steps.find((step) => !isDone(step));
}

/** Whether a step is running now, so nothing else may start. */
export function isRunning(view: StepperView): boolean {
  return view.steps.some((step) => step.outcome.kind === "running");
}

/**
 * Whether the screen may offer "Run all steps": only with two or more API steps left and no
 * browser step, and never when any step is `admin` or `irreversible` (HAL-17491 1.3).
 */
export function canRunAll(view: StepperView): boolean {
  const left = view.steps.filter((step) => step.outcome.kind === "pending");
  return (
    left.length > 1 &&
    view.steps.every((step) => step.risk === "routine" && step.action.kind === "call")
  );
}

/** Whether running the step first needs the extra confirmation. */
export function needsConfirmation(step: StepView): boolean {
  return step.risk === "irreversible";
}

/**
 * Whether a step's "Do it by hand" opens by itself: only when that step failed. While the service
 * is down, the whole guide opens instead, under a line that says why, so the same steps don't show
 * twice.
 */
export function showsManualFirst(step: StepView): boolean {
  return step.outcome.kind === "failed";
}

/**
 * The irreversible steps still to do, which the review warns about while the request can still
 * run them (HAL-17491 6.4). Empty once it is declined, expired or finished.
 */
export function irreversibleStepsAhead(view: StepperView): readonly StepView[] {
  if (!canDecline(view.stage)) return [];
  return view.steps.filter((step) => step.risk === "irreversible" && !isDone(step));
}

/**
 * Whether the user may still decline: while the request can run, while it waits for a sign-in,
 * where it can only be shown, such as Studio in a browser (HAL-17491 2.4), and when their settings
 * block it, so the requester hears it won't run.
 */
export function canDecline(stage: StepperStage): boolean {
  return (
    stage.kind === "ready" ||
    stage.kind === "sign-in" ||
    stage.kind === "missing-permission" ||
    stage.kind === "desktop-only" ||
    stage.kind === "blocked"
  );
}
