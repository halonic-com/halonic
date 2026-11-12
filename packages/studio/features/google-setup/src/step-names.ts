import type { StepId } from "@halonicjs/google-setup";

/** How a step is named in the progress line, such as "Step 4 of 7 · Scopes". */
export const stepNames: Readonly<Record<StepId, string>> = {
  project: "Project",
  apis: "APIs",
  consent: "Consent screen",
  scopes: "Scopes",
  client: "Client",
  credentials: "Credentials",
  "sign-in": "Sign in",
};
