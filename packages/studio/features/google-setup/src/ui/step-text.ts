import type { SetupStep } from "@halonicjs/google-setup";
import type { GoogleSetupAccount } from "../api.ts";
import { plural } from "../step-names.ts";

/** The one sentence on why a step is there, under its title while it is open. */
export function stepWhy(step: SetupStep): string {
  switch (step.id) {
    case "project":
      return "Google keeps everything your app needs in one project.";
    case "apis":
      return "Google keeps each API switched off until you switch it on.";
    case "consent":
      return "Tell Google what your app is called and who may use it.";
    case "scopes":
      return "Tell Google which parts of your account your app may use.";
    case "client":
      return "The client is what lets Halonic ask Google to sign you in.";
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
