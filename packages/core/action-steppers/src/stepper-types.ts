import type { ActionKeptValue } from "@halonicjs/events";
import type { ActionMethod, ActionRoute, ActionValue } from "@halonicjs/ports";
import type { Schema } from "@halonicjs/schema-kit";
import type { StepperRisk } from "./stepper-risk.ts";

/** A value a pasted-back result must match. Never a secret: a secret goes through a secret `input` step. */
export interface ResultField {
  label: string;
  /** An anchored pattern (`^…$`) the whole pasted value must match. */
  pattern: string;
}

/**
 * A step no API covers: the shell opens an address on the service's own web
 * origin, and the user follows numbered instructions written for that page.
 */
export interface GuidedStep {
  kind: "guided";
  /** The address with `{name}` placeholders, such as `https://github.com/{owner}/{repo}/settings/variables/actions/new`. */
  address: string;
  instructions: readonly string[];
  /** The date the instructions were last walked against the real page, such as `2026-11-24`. */
  checkedOn: string;
  result?: ResultField;
}

/**
 * A value only the user gives. A `secret` one is typed into the shell's
 * native dialog, so it never passes through the page, the request or a record.
 */
export interface InputStep {
  kind: "input";
  name: string;
  label: string;
  secret: boolean;
  /** For a non-secret input: the anchored pattern the value must match. */
  pattern?: string;
}

/**
 * How to do an API step by hand on the service's own web page, for the
 * manual guide (architecture note, 7.8). For a `call` it's the page that
 * makes the same change; for a `check`, how to see the result on the page.
 */
export interface ManualForm {
  /** The page with `{name}` placeholders, such as `https://github.com/{owner}/{repo}/settings/variables/actions`. */
  url: string;
  instructions: readonly string[];
}

/**
 * An API step a reviewed ToolScript does (ToolScript ADR, HAL-17560). Until
 * scripts run in Studio (HAL-17571) a step names only the script, and the
 * stepper can't run it (architecture note, 7.9). Its manual form is required,
 * so the manual guide can always say how to do it by hand.
 */
export interface ScriptStep {
  kind: "script";
  ref: string;
  manual: ManualForm;
}

/**
 * One field of a `call` step's body. A `parameter` field takes the request's
 * parameter of the same name, checked by that parameter's own field; a
 * `parameter-list` is one integer parameter the page sends as a one-item
 * list, such as `environment_ids: [environment_id]`; a `constant` is the
 * definition's value, which the shell adds itself.
 */
export type CallBodyField =
  | { name: string; kind: "parameter" }
  | { name: string; kind: "parameter-list"; parameter: string }
  | { name: string; kind: "constant"; value: ActionValue };

/**
 * An API step that changes something (architecture note, 1.2): one request on
 * the service's fixed API origin, which the shell sends with the user's token
 * only because its route is in the list generated from the catalog.
 */
export interface CallStep {
  kind: "call";
  method: Exclude<ActionMethod, "GET">;
  /** The path with `{name}` placeholders, each a parameter, such as `/repos/{owner}/{repo}/actions/variables/{name}`. */
  path: string;
  body: readonly CallBodyField[];
  /** The fields of a successful answer to keep, each a plain value; a dotted name such as `triggering_actor.login` reads inside objects. */
  keep: readonly string[];
  /**
   * Required when the definition is `irreversible`, and only then: the name the user types in the native dialog,
   * over the path's own placeholders, at least one, such as `{owner}/{repo} run {runId}`.
   */
  target?: string;
  manual: ManualForm;
}

/**
 * A value a `check` step must have kept for the stepper to go on: either a
 * fixed value, such as a runner's `status` being `offline` before it is
 * removed, or the value of one of the request's parameters, such as an
 * environment's kept `id` being the `environment_id` the next step approves,
 * so the step can't change something other than what the check read and the
 * preview shows. `reason` is the definition's own sentence the stepper stops
 * with; the kept value stays out of it.
 */
export type CheckRequirement =
  | {
      /** A field the step keeps. */
      name: string;
      equals: ActionValue;
      reason: string;
    }
  | {
      /** A field the step keeps. */
      name: string;
      /** The parameter the kept value must equal. */
      equalsParameter: string;
      reason: string;
    };

/**
 * A read-only `GET` (architecture note, 1.2 and 6.2): it reads the state a
 * later step changes, so the preview can show it and the request's `expect`
 * can be compared with it before anything changes.
 */
export interface CheckStep {
  kind: "check";
  /** The path with `{name}` placeholders, each a parameter. */
  path: string;
  /** The fields of the answer to keep, each a plain value; a dotted name such as `triggering_actor.login` reads inside objects. */
  keep: readonly string[];
  /**
   * A kept field holding a time that must be later than when the stepper
   * opened, such as a secret's `updated_at` after a guided step where the
   * user set it (see `checkChangedAfterStart`). It must be one of `keep`.
   */
  changedAfterStart?: string;
  /** What the kept values must be before the next step runs; see `checkStepGate`. */
  requires?: readonly CheckRequirement[];
  /**
   * Fields the request's `expect` must name, such as a run's `head_sha`:
   * without one, there is nothing to compare, so a change since the request
   * would go unseen. Each is one of `keep`.
   */
  requiredExpect?: readonly string[];
  manual: ManualForm;
}

/** A step that calls the service's API: a reviewed `call` or `check`, or a ToolScript's `script`. */
export type ApiStep = CallStep | CheckStep | ScriptStep;

/**
 * The parts of a service's own sign-in, one step each (architecture note,
 * row 15): `start` shows the code and the countdown, `approve` opens the
 * approval page the start answered, `keep` waits for the approval and puts
 * the key in the keychain, and `test` says who is signed in and revokes a
 * test sign-in.
 */
export type SignInPhase = "start" | "approve" | "keep" | "test";

/**
 * One part of a service's own sign-in, run through the `ServiceSignIn` port
 * in the foreground only (architecture note, 6.7). It isn't an API step: it
 * sends no reviewed call and has no route, and the approval page comes from
 * the sign-in's own answer, never from a template, so a definition can't
 * name another host (Liam's approval on HAL-17545).
 */
export interface SignInStep {
  kind: "sign-in";
  /** Only Paperclip: another service is a reviewed change to the port. */
  service: "paperclip";
  phase: SignInPhase;
  /** How to do this part by hand, for the manual guide. */
  manual: ManualForm;
}

/** One step of a stepper definition. */
export type Step = GuidedStep | InputStep | ApiStep | SignInStep;

/** Something a stepper touches, shown before anything runs, such as GitHub repository `acme/app`. */
export interface StepperTarget {
  service: string;
  /** What kind of thing it is in the service's words, such as `repository`, `zone` or `page`. */
  kind: string;
  /** The exact target, such as `acme/app`, `acme.example` or `github.com/acme/app/settings/variables/`. */
  name: string;
}

/**
 * A reviewed stepper, shipped in `core/action-catalog`. A step type is a
 * definition with one step. Its parameters' schema is strict and every string
 * in it has a pattern or an enum (see `strictParameters`).
 */
export interface StepperDefinition<Parameters = unknown> {
  /** Such as `github.set-variable`. */
  id: string;
  /** The major version; a request names it as `github.set-variable@1`. */
  version: number;
  service: string;
  title: string;
  summary: string;
  risk: StepperRisk;
  parameters: Schema<Parameters>;
  steps: readonly Step[];
  /** What the stepper touches for these parameters. */
  targets(parameters: Parameters): readonly StepperTarget[];
  /**
   * One plain-language sentence per step, for these parameters. `current` is
   * what the definition's `check` steps kept, once they've run, so a sentence
   * can set today's state next to the change (architecture note, 2.3).
   */
  preview(
    parameters: Parameters,
    current?: Readonly<Record<string, ActionKeptValue>>,
  ): readonly string[];
}

/**
 * The pages a `browser` block may open on one web origin. A prefix may hold
 * `{name}` placeholders, each standing for one path segment; it never covers
 * a bare settings page (architecture note, 7.1).
 */
export interface BrowserOrigin {
  service: string;
  /** The host alone, lower-case, such as `github.com`. Always `https`, on the default port. */
  host: string;
  pathPrefixes: readonly string[];
}

/** The reviewed things a request may use: shipped definitions, step types and browser origins. */
export interface StepperCatalog {
  /** A whole shipped definition, or `undefined` when this Halonic has none of that id and version. */
  definition(id: string, version: number): StepperDefinition | undefined;
  /** A reviewed step type, or `undefined` when there is none of that id and version. */
  stepType(id: string, version: number): StepperDefinition | undefined;
  browserOrigins: readonly BrowserOrigin[];
  /**
   * The route of one step of a definition or step type (`step` from 1), from the same generated
   * route list the desktop shell compiles; `undefined` for a step with no route, such as an
   * `input` step. The page uses it only to sort a request's values into the route's placeholders
   * and body: the shell checks everything again against its own list (architecture note, 2.4).
   */
  route(id: string, version: number, step: number): ActionRoute | undefined;
}
