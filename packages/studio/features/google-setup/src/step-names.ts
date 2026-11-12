import type { SetupStep, StepId } from "@halonicjs/google-setup";

/**
 * How a step is named in the progress line, such as "Step 4 of 7 · Scopes". The checklist names
 * the same step with {@link stepTitle}, so a step is renamed in both places or in neither.
 */
export const stepNames: Readonly<Record<StepId, string>> = {
  project: "Project",
  apis: "APIs",
  consent: "Consent screen",
  scopes: "Scopes",
  client: "Client",
  credentials: "Credentials",
  "sign-in": "Sign in",
};

/** "1 API", "3 APIs". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * A step's title in the checklist, longer than its {@link stepNames} entry. Only the step's own
 * data is read, so a service is never named here: its name comes from the account's services.
 */
export function stepTitle(step: SetupStep): string {
  switch (step.id) {
    case "project":
      return "Google Cloud project";
    case "apis":
      return `Switch on ${plural(step.apis.length, "API", "APIs")}`;
    case "consent":
      return "Consent screen";
    case "scopes":
      return "Scopes";
    case "client":
      return "Create the client";
    case "credentials":
      return "Client ID and secret";
    case "sign-in":
      return "Sign in with Google";
  }
}
