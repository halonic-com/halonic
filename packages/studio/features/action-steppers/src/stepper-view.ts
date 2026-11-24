/**
 * The action stepper's view model: what the screen shows for one action request. It's local to
 * this feature on purpose, so the screen can be built before `core/actions` lands; a later pull
 * request fills it from that package and the app service (HAL-17488). The screen only draws it and
 * calls back; the few rules it needs are the pure functions at the end of this file.
 */
import type { SecretText } from "@halonicjs/studio-kit";

/** How much harm a step can do: `routine`, an `admin` change, or `irreversible`. */
export type StepRisk = "routine" | "admin" | "irreversible";

/** The service a request's steps go to, which decides how the user signs in. */
export type StepperService = "github" | "cloudflare";

/** One HTTP call, exactly as the user's client will send it, for "Show the request". */
export interface StepCall {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly address: string;
  /** The JSON body as it will be sent, or `undefined` when the call has none. */
  readonly body?: string | undefined;
}

/** Where a step stands. `skipped` is a step a check showed was done already. */
export type StepOutcome =
  | { readonly kind: "to-do" }
  | { readonly kind: "running" }
  | { readonly kind: "succeeded"; readonly result?: string | undefined }
  | { readonly kind: "failed"; readonly status: number; readonly message: string }
  | { readonly kind: "skipped" };

/** One step of the request, in plain words, with its call and where it stands. */
export interface StepView {
  /** Counted from 1, as the screen says it: "Run step 2 of 3". */
  readonly number: number;
  /** The definition's plain-language preview of the step. */
  readonly preview: string;
  readonly risk: StepRisk;
  readonly call: StepCall;
  readonly outcome: StepOutcome;
}

/**
 * Who asked. A request opened from a `halonic://action` link carries no sender anyone checked, so
 * it is never shown as coming from an agent (Julian's finding on HAL-17491).
 */
export type StepperRequester =
  | { readonly kind: "agent"; readonly name: string }
  | { readonly kind: "link" };

/** How the user signs in to the request's service, when the stepper has no token for it yet. */
export type StepperSignIn =
  | {
      readonly service: "github";
      /** The device code GitHub gave, for the user to type on `address`. */
      readonly code: string;
      readonly address: string;
    }
  | {
      readonly service: "cloudflare";
      /** The token's permission groups and resources, one line each: "Zone · DNS · Edit, on zone acme.example only". */
      readonly permissions: readonly string[];
      /** The Cloudflare dashboard's page where the user creates the token. */
      readonly tokenPage: string;
    };

/**
 * What the screen as a whole shows besides the request. `ready` is the review and the run, step
 * by step; the others say why nothing (more) can run.
 */
export type StepperStage =
  | { readonly kind: "ready" }
  | { readonly kind: "sign-in"; readonly signIn: StepperSignIn }
  | { readonly kind: "missing-permission"; readonly permission: string }
  | { readonly kind: "declined" }
  | { readonly kind: "expired" }
  | { readonly kind: "not-available" }
  | { readonly kind: "desktop-only" }
  | { readonly kind: "finished" };

/** One action request as the stepper shows it. */
export interface StepperView {
  /** The definition's title, filled from the checked parameters: "Approve the deployment of acme/app to release". */
  readonly title: string;
  readonly service: StepperService;
  /** The account the user's token belongs to, or `null` before they sign in. */
  readonly account: string | null;
  /** What the steps change: an account, a repository, a zone. */
  readonly target: string;
  /** The request's highest step risk. */
  readonly risk: StepRisk;
  readonly expiresAt: Date;
  readonly requester: StepperRequester;
  /** The requester's own words. Untrusted: always shown as plain, quoted text. */
  readonly reason: string;
  /** Empty when the installed Halonic doesn't know the request's definition. */
  readonly steps: readonly StepView[];
  readonly stage: StepperStage;
}

/** What the screen calls back. The owner of the view model runs the step and updates the view. */
export interface StepperActions {
  /** Runs one step. For an `irreversible` step only after the user confirmed it. */
  readonly runStep: (number: number) => void;
  /** Runs every step still to do, in order. Only offered when {@link canRunAll} is true. */
  readonly runAll: () => void;
  readonly decline: () => void;
  /** Sends the pasted Cloudflare token to the desktop shell, which keeps it in the OS keychain. */
  readonly saveToken: (token: SecretText) => void;
  /** Starts the service's sign-in again, with another account or more permissions. */
  readonly signInAgain: () => void;
}

/** The step to run next: the first that hasn't succeeded or been skipped, or `undefined` when none is left. */
export function nextStep(view: StepperView): StepView | undefined {
  return view.steps.find(
    (step) => step.outcome.kind !== "succeeded" && step.outcome.kind !== "skipped",
  );
}

/** Whether a step is running now, so nothing else may start. */
export function isRunning(view: StepperView): boolean {
  return view.steps.some((step) => step.outcome.kind === "running");
}

/**
 * Whether the screen may offer "Run all steps": only with two or more steps left, and never when
 * any step is `admin` or `irreversible`, which the user runs one at a time (HAL-17491 1.3).
 */
export function canRunAll(view: StepperView): boolean {
  const left = view.steps.filter((step) => step.outcome.kind === "to-do");
  return left.length > 1 && view.steps.every((step) => step.risk === "routine");
}

/** Whether running the step first needs the extra confirmation. */
export function needsConfirmation(step: StepView): boolean {
  return step.risk === "irreversible";
}

/**
 * Whether the user may still decline: while the request can run, while it waits for a sign-in,
 * and where it can only be shown, such as Studio in a browser (HAL-17491 2.4).
 */
export function canDecline(stage: StepperStage): boolean {
  return (
    stage.kind === "ready" ||
    stage.kind === "sign-in" ||
    stage.kind === "missing-permission" ||
    stage.kind === "desktop-only"
  );
}
