import { consoleUrl, enableAllApisUrl, isProjectId } from "./console-links.ts";
import { mergeApis, mergeScopes } from "./service-rows.ts";
import type { SetupInput } from "./setup-input.ts";
import type {
  CopyValue,
  CopyValueId,
  ScopeRow,
  SetupStep,
  SetupSteps,
  StepId,
} from "./setup-step.ts";

/** The values the flow fills in itself (design 3.2). */
const suggestedProjectName = "halonic";
const appName = "Halonic (own app)";
const clientName = "Halonic desktop";

/**
 * A step's fields except its number, which is counted at the end. Written as
 * a conditional type so `Omit` applies to each kind of step on its own and
 * keeps its details.
 */
type Unnumbered<Step> = Step extends SetupStep ? Omit<Step, "number"> : never;
type UnnumberedStep = Unnumbered<SetupStep>;

/**
 * Generates the Google setup steps for the ticked services (design 3.2).
 * The result is data: ids, values and links. Studio owns the sentences around
 * them, so they can be translated and corrected without touching this code.
 *
 * @param input - the route, the account, the project ID if known, and the
 *   ticked services with their sheets' Google fields.
 * @returns the steps in order, numbered after step 4 is left in or out.
 * @throws RangeError when no service is ticked, two services share an id, or
 *   a sheet's API isn't a Google API host.
 *
 * @example
 * const setup = setupSteps({
 *   route: { app: "own", runsOn: "this-computer" },
 *   accountType: "personal",
 *   account: "someone@example.com",
 *   services: [notesService],
 * });
 * setup.steps.map((step) => step.id); // ["project", "apis", …, "sign-in"]
 */
export function setupSteps(input: SetupInput): SetupSteps {
  checkServices(input);
  const givenProjectId = input.projectId?.trim() ?? "";
  const projectId = isProjectId(givenProjectId) ? givenProjectId : undefined;
  const scopes = mergeScopes(input.services);

  const steps: UnnumberedStep[] = [
    projectStep(input),
    apisStep(input, projectId),
    consentStep(input, projectId),
  ];
  if (input.listScopes ?? true) {
    steps.push(scopesStep(scopes, projectId));
  }
  steps.push(clientStep(projectId), credentialsStep(projectId), signInStep(input, scopes));

  return {
    accountType: input.accountType,
    services: input.services.map(({ id, label }) => ({ id, label })),
    projectIdIgnored: givenProjectId !== "" && projectId === undefined,
    steps: steps.map((step, index) => ({ ...step, number: index + 1 })),
  };
}

function checkServices(input: SetupInput): void {
  if (input.services.length === 0) {
    throw new RangeError("The Google setup needs at least one ticked service.");
  }
  const ids = new Set(input.services.map((service) => service.id));
  if (ids.size !== input.services.length) {
    throw new RangeError("Two ticked services share an id. Each service is listed once.");
  }
}

function copyValue(id: CopyValueId, value: string): CopyValue {
  return { id, value };
}

/** The fields every step starts from; each step adds its own. */
function stepBase<Id extends StepId>(id: Id) {
  return { id, links: [], copyValues: [], requiredTicks: [], doneWhen: "marked-done" } as const;
}

function projectStep(input: SetupInput): UnnumberedStep {
  return {
    ...stepBase("project"),
    // A new project has no ID yet, so this link never carries one.
    links: [{ id: "new-project", url: consoleUrl("new-project", undefined) }],
    copyValues: [copyValue("project-name", suggestedProjectName)],
    // Google offers an Internal app only in a project inside the organisation.
    location: input.accountType === "workspace" ? "inside-organisation" : "any",
  };
}

function apisStep(input: SetupInput, projectId: string | undefined): UnnumberedStep {
  const apis = mergeApis(input.services, projectId);
  const base = { ...stepBase("apis"), apis };
  if (apis.length < 2) {
    return base;
  }
  return {
    ...base,
    switchOnAllUrl: enableAllApisUrl(
      apis.map((row) => row.api),
      projectId,
    ),
  };
}

function consentStep(input: SetupInput, projectId: string | undefined): UnnumberedStep {
  const personal = input.accountType === "personal";
  return {
    ...stepBase("consent"),
    links: [
      { id: "branding", url: consoleUrl("branding", projectId) },
      { id: "audience", url: consoleUrl("audience", projectId) },
    ],
    copyValues: [
      copyValue("app-name", appName),
      copyValue("support-email", input.account),
      copyValue("contact-email", input.account),
    ],
    // An External app left in Testing loses its sign-in after 7 days.
    requiredTicks: personal ? ["in-production"] : [],
    audience: personal ? "external" : "internal",
  };
}

function scopesStep(scopes: readonly ScopeRow[], projectId: string | undefined): UnnumberedStep {
  return {
    ...stepBase("scopes"),
    links: [{ id: "data-access", url: consoleUrl("data-access", projectId) }],
    // Google's "Manually add scopes" box takes them as one comma-separated line.
    copyValues: [copyValue("all-scopes", scopes.map((row) => row.scope).join(","))],
    scopes,
  };
}

function clientStep(projectId: string | undefined): UnnumberedStep {
  return {
    ...stepBase("client"),
    links: [
      { id: "clients", url: consoleUrl("clients", projectId) },
      { id: "create-client", url: consoleUrl("create-client", projectId) },
    ],
    copyValues: [copyValue("client-name", clientName)],
    // Google shows the secret only once, so the user goes straight on to step 6
    // and a valid client ID there finishes this step.
    doneWhen: "client-id-saved",
  };
}

function credentialsStep(projectId: string | undefined): UnnumberedStep {
  return {
    ...stepBase("credentials"),
    // For "Add secret" when the user closed Google's window too soon (3.6).
    links: [{ id: "clients", url: consoleUrl("clients", projectId) }],
    doneWhen: "client-id-and-secret-saved",
  };
}

function signInStep(input: SetupInput, scopes: readonly ScopeRow[]): UnnumberedStep {
  return {
    ...stepBase("sign-in"),
    doneWhen: "signed-in-and-checked",
    beforeSignIn: input.accountType === "workspace" ? "admin-note" : "warning-preview",
    scopesToGrant: scopes,
    checks: input.services.map((service) =>
      service.googleCheck === undefined
        ? { service: service.id }
        : { service: service.id, request: service.googleCheck },
    ),
  };
}
