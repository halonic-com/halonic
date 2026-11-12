import type { SetupStep } from "@halonicjs/google-setup";
import type { GoogleSetupAccount } from "../api.ts";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * A step's title in the checklist. Only the step's own data is read, so a service is never
 * named here: its name comes from the account's services.
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

/** The one sentence on why a step is there, under its title while it is open. */
export function stepWhy(step: SetupStep): string {
  switch (step.id) {
    case "project":
      return "Google keeps your app in a project of its own.";
    case "apis":
      return "Google keeps each API switched off until you switch it on.";
    case "consent":
      return "Tell Google what your app is called and who may use it.";
    case "scopes":
      return "Tell Google what your app may ask for.";
    case "client":
      return "The client is how Halonic signs in to Google.";
    case "credentials":
      return "Give Halonic the client's ID and secret.";
    case "sign-in":
      return "Sign in so Google lets Halonic use your account.";
  }
}

/** What a finished step shows after its title, in muted text: the project ID, the API names. */
export function foldedValue(step: SetupStep, account: GoogleSetupAccount): string {
  switch (step.id) {
    case "project":
      return account.record.projectId ?? "";
    case "apis":
      return step.apis.map((row) => row.name).join(", ");
    case "consent":
      return step.audience === "external" ? "External" : "Internal";
    case "scopes":
      return plural(step.scopes.length, "scope", "scopes");
    case "client":
    case "sign-in":
      return "";
    case "credentials":
      return account.record.clientId ?? "";
  }
}
