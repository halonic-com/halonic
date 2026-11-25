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
 * An API step (`call` or `check`). Its shape comes from the ToolScript ADR
 * (HAL-17560); until then a step names only the script it will run, and the
 * stepper can't run it (architecture note, 7.9). Its manual form is required,
 * so the manual guide can always say how to do it by hand.
 */
export interface ScriptStep {
  kind: "script";
  ref: string;
  manual: ManualForm;
}

/** One step of a stepper definition. */
export type Step = GuidedStep | InputStep | ScriptStep;

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
  /** One plain-language sentence per step, for these parameters. */
  preview(parameters: Parameters): readonly string[];
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
}
