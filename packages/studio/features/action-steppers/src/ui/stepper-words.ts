/**
 * Every sentence the action stepper shows, in one place for the copy check (HAL-17527). The
 * request's own text (title, step previews, reason) comes from the view model and is never built here.
 */
import type {
  StepOutcome,
  StepperRequester,
  StepperService,
  StepperStage,
  StepRisk,
} from "../stepper-view.ts";

/** The service's name as people write it. */
export const serviceNames: Record<StepperService, string> = {
  github: "GitHub",
  cloudflare: "Cloudflare",
};

/** The risk as a chip's word. */
export const riskWords: Record<StepRisk, string> = {
  routine: "Routine",
  admin: "Admin change",
  irreversible: "Can't be undone",
};

/** The labels of the review's facts. */
export const factLabels = {
  account: "Signed in as",
  target: "Changes",
  risk: "Risk",
  expires: "Expires",
  requester: "Asked by",
  reason: "Their reason",
} as const;

/** The account fact before the user signs in. */
export const notSignedIn = "Not signed in";

/** Who asked, as the review says it. */
export function requesterText(requester: StepperRequester): string {
  return requester.kind === "link" ? "From a link, sender unknown" : `${requester.name} (agent)`;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "24 Nov at 14:05", in local time. */
export function expiresText(at: Date): string {
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return `${at.getDate()} ${months[at.getMonth()]} at ${time}`;
}

/** The fold with the exact calls: its row while closed and while open. */
export const showRequest = "Show the request";
/** See {@link showRequest}. */
export const hideRequest = "Hide the request";
/** The heading over the step list. */
export const stepsHeading = "Steps";

/** A step's caption in the list. */
export function stepLabel(number: number, total: number): string {
  return `Step ${number} of ${total}`;
}

/** The line under a step that has started. `null` while it is still to do. */
export function outcomeText(outcome: StepOutcome, service: StepperService): string | null {
  switch (outcome.kind) {
    case "to-do":
      return null;
    case "running":
      return "Running…";
    case "succeeded":
      return outcome.result === undefined ? "Done." : `Done. ${outcome.result}`;
    case "failed":
      return `Failed with status ${outcome.status}. ${serviceNames[service]} said: “${outcome.message}”`;
    case "skipped":
      return "Done already";
  }
}

/** The buttons under the steps. */
export const runWords = {
  step: (number: number, total: number) => `Run step ${number} of ${total}`,
  busy: (number: number) => `Running step ${number}…`,
  retry: (number: number) => `Try step ${number} again`,
  all: "Run all steps",
  allBusy: "Running…",
  decline: "Decline",
} as const;

/** The extra confirmation before an irreversible step. */
export const confirmWords = {
  title: (number: number) => `Run step ${number}? It can't be undone.`,
  body: "Once this step has run, Halonic can't undo it.",
  confirm: (number: number) => `Run step ${number}`,
  busy: "Running…",
} as const;

/** The sign-in panels. */
export const signInWords = {
  githubHeading: "Sign in to GitHub",
  githubText: "Open GitHub's sign-in page and enter this code.",
  githubCode: "Sign-in code",
  githubOpen: "Open GitHub",
  githubWaiting: "Waiting for you to finish on GitHub…",
  cloudflareHeading: "Add a Cloudflare API token",
  cloudflareText: "Create a token with these permissions, then paste it here.",
  cloudflareOpen: "Open Cloudflare's token page",
  tokenLabel: "API token",
  tokenEmpty: "Paste the token first.",
  save: "Save token",
  kept: "Kept in your computer's keychain. Agents never see it.",
  signInAgain: "Sign in again",
} as const;

/** The line when the signed-in account lacks a permission the request needs. */
export function missingPermissionText(
  service: StepperService,
  account: string | null,
  permission: string,
): string {
  const who = account === null ? `Your ${serviceNames[service]} account` : `${account}`;
  return `${who} doesn't have the permission “${permission}”, which this request needs.`;
}

/** The line for a stage where nothing (more) runs. `null` for the stages with their own panel. */
export function stageText(stage: StepperStage): string | null {
  switch (stage.kind) {
    case "declined":
      return "You declined this request. Nothing more will run.";
    case "expired":
      return "This request has expired, so it can't run anymore.";
    case "not-available":
      return "This request isn't available in this version of Halonic, so it can't run here.";
    case "desktop-only":
      return "Open it in the desktop app to run it.";
    case "finished":
      return "Finished. Every step is done.";
    default:
      return null;
  }
}
