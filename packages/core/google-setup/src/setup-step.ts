import type { AccountType } from "./account-type.ts";
import type { ConsolePage } from "./console-links.ts";
import type { GoogleCheck } from "./setup-input.ts";

/**
 * A step's stable name. Progress keys ticks by it, never by number, so
 * leaving out step 4 doesn't move anyone's ticks.
 */
export type StepId =
  | "project"
  | "apis"
  | "consent"
  | "scopes"
  | "client"
  | "credentials"
  | "sign-in";

/** A link to a Console page. Studio picks the link text from the id. */
export interface StepLink {
  readonly id: ConsolePage;
  readonly url: string;
}

/** What a copy value is. Studio picks its label from this id. */
export type CopyValueId =
  | "project-name"
  | "app-name"
  | "support-email"
  | "contact-email"
  | "all-scopes"
  | "client-name";

/** A value the user types into Google, offered with a copy button. */
export interface CopyValue {
  readonly id: CopyValueId;
  readonly value: string;
}

/** A tick the user must set before **Done, next**: the app is in production. */
export type RequiredTick = "in-production";

/** What finishes a step (design 3.2, last column). */
export type DoneWhen =
  | "marked-done"
  | "client-id-saved"
  | "client-id-and-secret-saved"
  | "signed-in-and-checked";

/** One API to switch on in step 2, merged across services. */
export interface ApiRow {
  readonly api: string;
  readonly name: string;
  /** The ids of the ticked services that need it, in input order. */
  readonly neededBy: readonly string[];
  readonly enableUrl: string;
}

/** One scope, merged across services. */
export interface ScopeRow {
  readonly scope: string;
  /** True when any service's sheet calls the scope restricted. */
  readonly restricted: boolean;
  /** Each service that needs it, with that service's own reason. */
  readonly neededBy: readonly { readonly service: string; readonly reason: string }[];
}

/** The read after sign-in for one service, or none when its sheet has none. */
export interface ServiceCheck {
  readonly service: string;
  readonly request?: GoogleCheck;
}

interface StepBase<Id extends StepId> {
  readonly id: Id;
  /** The number shown to the user, counted after step 4 is left in or out. */
  readonly number: number;
  readonly links: readonly StepLink[];
  readonly copyValues: readonly CopyValue[];
  readonly requiredTicks: readonly RequiredTick[];
  readonly doneWhen: DoneWhen;
}

/** Step 1. A Workspace project must sit inside the organisation. */
export interface ProjectStep extends StepBase<"project"> {
  readonly location: "inside-organisation" | "any";
}

/** Step 2. `switchOnAllUrl` is there when there are two APIs or more. */
export interface ApisStep extends StepBase<"apis"> {
  readonly apis: readonly ApiRow[];
  readonly switchOnAllUrl?: string;
}

/** Step 3. A personal account's app is External and must be published. */
export interface ConsentStep extends StepBase<"consent"> {
  readonly audience: "internal" | "external";
}

/** Step 4, when `listScopes` is on. */
export interface ScopesStep extends StepBase<"scopes"> {
  readonly scopes: readonly ScopeRow[];
}

/** Step 5. */
export type ClientStep = StepBase<"client">;

/** Step 6. */
export type CredentialsStep = StepBase<"credentials">;

/**
 * Step 7. It carries the scopes Google has to grant whether or not step 4 is
 * listed, so a new scope always shows as a change here.
 */
export interface SignInStep extends StepBase<"sign-in"> {
  readonly beforeSignIn: "admin-note" | "warning-preview";
  readonly scopesToGrant: readonly ScopeRow[];
  readonly checks: readonly ServiceCheck[];
}

/** One generated step. Switch on `id` to reach its own details. */
export type SetupStep =
  | ProjectStep
  | ApisStep
  | ConsentStep
  | ScopesStep
  | ClientStep
  | CredentialsStep
  | SignInStep;

/** The generated setup: the steps in order, and what they were made for. */
export interface SetupSteps {
  readonly accountType: AccountType;
  /** The ticked services, so Studio can name them ("3 steps for …"). */
  readonly services: readonly { readonly id: string; readonly label: string }[];
  /**
   * True when a project ID was given but isn't valid, so the links leave it
   * out. Studio says why, rather than showing links that open in some other
   * project.
   */
  readonly projectIdIgnored: boolean;
  readonly steps: readonly SetupStep[];
}
