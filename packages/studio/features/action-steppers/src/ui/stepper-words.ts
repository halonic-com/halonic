/**
 * Every sentence the action stepper shows, in one place for the copy check (HAL-17541). The
 * request's own text (title, step previews, instructions, reason) comes from the view model and is
 * never built here.
 */
import type {
  InstructionsSource,
  StepAction,
  StepOutcome,
  StepperRequester,
  StepperService,
  StepperStage,
  StepperTouch,
  StepRisk,
} from "../stepper-view.ts";

const serviceNames: Readonly<Record<string, string>> = {
  github: "GitHub",
  cloudflare: "Cloudflare",
  paperclip: "Paperclip",
};

/** The service's name as people write it; an id the words don't know is shown as it is. */
export function serviceName(service: StepperService): string {
  return serviceNames[service] ?? service;
}

/** The risk as a chip's word. */
export const riskWords: Record<StepRisk, string> = {
  routine: "Routine",
  admin: "Admin change",
  irreversible: "Can't be undone",
};

/** The labels of the review's facts. */
export const factLabels = {
  account: "Signed in as",
  risk: "Risk",
  expires: "Expires",
  requester: "Asked by",
  reason: "Their reason",
  touches: "This stepper touches",
} as const;

/** The account fact before the user signs in. */
export const notSignedIn = "Not signed in";

/** Who asked, as the messaging source names them: "Chief on Paperclip · Acme". */
export function requesterText(requester: StepperRequester): string {
  return `${requester.name} on ${requester.source}`;
}

/** One line of the touches list. */
export function touchText(touch: StepperTouch): string {
  return touch.kind === "target" ? `${touch.service}: ${touch.target}` : `Opens ${touch.address}`;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "24 Nov", in local time. */
function dayText(at: Date): string {
  return `${at.getDate()} ${months[at.getMonth()]}`;
}

/** "24 Nov at 14:05", in local time. */
export function expiresText(at: Date): string {
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return `${dayText(at)} at ${time}`;
}

/**
 * A step as "Show the request" writes the steps that aren't a call: the page a browser step opens,
 * the reviewed script an API step runs, or the value the user gives.
 */
export function actionLine(action: Exclude<StepAction, { readonly kind: "call" }>): string {
  switch (action.kind) {
    case "browser":
      return touchText({ kind: "page", address: action.address });
    case "script":
      return `Runs the reviewed script ${action.script}`;
    case "sign-in":
      return signInLines[action.phase];
    case "input":
      return action.secret
        ? `You type “${action.label}” into the desktop app's secure field`
        : `You type “${action.label}”`;
  }
}

/** What each part of a sign-in does, in "Show the request". */
const signInLines = {
  start: "Starts a Paperclip sign-in in the desktop app and shows its code",
  approve: "Opens the approval page the sign-in gives, on the connection's own Paperclip",
  keep: "Waits for your approval, then keeps the key in this computer's keychain",
  test: "Says who is signed in, and revokes the key of a test sign-in",
} as const;

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

/**
 * The line under a step that has started. `null` while it is still to do. A failure names the
 * service and its status, never the service's own text (microcopy 1.6 E3): that goes to
 * {@link failureDetails}, for **Copy details**.
 */
export function outcomeText(outcome: StepOutcome, service: StepperService): string | null {
  switch (outcome.kind) {
    case "pending":
      return null;
    case "running":
      return "Running…";
    case "succeeded":
      return outcome.result === undefined ? "Done." : `Done. ${outcome.result}`;
    case "failed":
      // Without a status nothing reached the service, so the reason is in Halonic's own words.
      if (outcome.status === undefined) return `Failed. ${outcome.message}`;
      return `Failed: ${serviceName(service)} refused this step (status ${outcome.status}).`;
    case "skipped":
      return "Done already";
    case "by-hand":
      return outcome.checked === null ? "Done by hand, not checked" : `Checked: ${outcome.checked}`;
  }
}

/**
 * What **Copy details** puts on the clipboard for a failed step: the service's status and its own
 * words, for a bug report.
 *
 * @example
 * failureDetails(403, "Resource not accessible by integration", "github");
 * // "Status 403. GitHub said: “Resource not accessible by integration”"
 */
export function failureDetails(
  status: number | undefined,
  message: string,
  service: StepperService,
): string {
  // Without a status the message is Halonic's own, so it isn't quoted as the service's.
  if (status === undefined) return message;
  return `Status ${status}. ${serviceName(service)} said: “${message}”`;
}

/** The buttons under the steps. */
export const runWords = {
  step: (number: number, total: number) => `Run step ${number} of ${total}`,
  busy: (number: number) => `Running step ${number}…`,
  retry: (number: number) => `Try step ${number} again`,
  all: "Run all steps",
  decline: "Decline",
} as const;

/** The extra confirmation before an irreversible step. */
export const confirmWords = {
  title: (number: number) => `Run step ${number}? It can't be undone.`,
  body: "Once this step has run, Halonic can't undo it.",
  confirm: (number: number) => `Run step ${number}`,
  busy: "Running…",
} as const;

/** A browser step's label over its instructions. */
export function sourceText(source: InstructionsSource, requester: StepperRequester): string {
  switch (source.kind) {
    case "library":
      return `Checked on ${dayText(source.checkedOn)}`;
    case "docs":
      return "From the service's docs, not checked on the page";
    case "unchecked":
      return "Not checked on the page";
    case "requester":
      return `Instructions from ${requesterText(requester)}, not checked by Halonic`;
  }
}

/** What "Copy instructions" copies: the label for on-demand steps, the address, the numbered lines. */
export function instructionsText(
  label: string | null,
  address: string,
  lines: readonly string[],
): string {
  const numbered = lines.map((line, index) => `${index + 1}. ${line}`);
  return [...(label === null ? [] : [label]), address, ...numbered].join("\n");
}

/** A browser step's controls. `copied` and `notCopied` are the kit's CopyButton's own words. */
export const browserWords = {
  open: "Open the page",
  copy: "Copy instructions",
  copied: "Copied",
  notCopied: "Couldn't copy. Select the text and copy it yourself.",
  done: (number: number) => `Step ${number} is done`,
} as const;

/** The hint under a paste-back field the requester named (HAL-17491 7.1). */
export function resultHintText(requester: StepperRequester): string {
  return `From ${requesterText(requester)}, not checked by Halonic`;
}

/**
 * Why a pasted result wasn't kept, under its field. Neither repeats the value: a key-shaped one
 * holds the key (HAL-17491 7.6).
 */
export const pastedResultWords = {
  "key-shaped": "This looks like a key: use the secure field.",
  "no-match": "This doesn't match what the step asks for. Check it and paste it again.",
} as const;

/** The line above the steps while the service's API is down. */
export function serviceDownText(service: StepperService): string {
  return `${serviceName(service)} isn't answering right now, so the steps may fail. You can do them all by hand below.`;
}

/** The warning under the facts for a step that can't be undone (HAL-17491 6.4). */
export function irreversibleTitle(number: number): string {
  return `Step ${number} can't be undone`;
}

/** The manual guide and Done by hand (HAL-17491 7.8). */
export const manualWords = {
  stepper: "Do it all by hand",
  step: "Do it by hand",
  hide: "Hide the steps by hand",
  open: "Open the page",
  check: (check: string) => `To check: ${check}`,
  markDone: "Mark done by hand",
} as const;

/** The sign-in panels. */
export const signInWords = {
  githubHeading: "Sign in to GitHub",
  githubStart: "Sign in to GitHub",
  githubText: "Enter this code on the GitHub page that opened.",
  githubCode: "Sign-in code",
  githubWaiting: "Waiting for you to finish on GitHub…",
  cloudflareHeading: "Add a Cloudflare API token",
  cloudflareText:
    "Create a token on Cloudflare's API tokens page with these permissions, then paste it into the secure field.",
  cloudflarePaste: "Paste the token",
  kept: "Kept in your computer's keychain. Agents never see it.",
  signInAgain: "Sign in again",
} as const;

/** The Paperclip sign-in's panel in a stepper (`action-steppers.paperclip-sign-in-run`). */
export const serviceSignInWords = {
  heading: "Paperclip sign-in",
  code: "Code",
  compare: "On the approval page, check the code matches this one, then click Approve.",
  timeLeft: (milliseconds: number) => {
    const seconds = Math.ceil(milliseconds / 1000);
    const shown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    return `${shown} left to approve`;
  },
  timeUp: "The time to approve is up. Try the step again for a new code.",
  signedInAs: (account: string) => `Signed in as ${account}.`,
} as const;

/** The line when the signed-in account lacks a permission the request needs. */
export function missingPermissionText(
  service: StepperService,
  account: string | null,
  permission: string,
): string {
  const who = account ?? `Your ${serviceName(service)} account`;
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
    case "blocked":
      return "Blocked by your settings. This requester may only ask for steps marked Routine.";
    case "changed":
      return stage.message;
    case "finished":
      return "Finished. Every step is done.";
    default:
      return null;
  }
}

/** The words around each value a stopped request shows (`action-steppers.expect-stop`). */
export const changeWords = {
  expected: "When asked:",
  today: "Today:",
  /** The check read nothing for that name: the service no longer has it, or it was done by hand. */
  notRead: "nothing found",
} as const;

/**
 * A value a stopped request shows, as data: a text in quotes, so `"1"` and `1` look as different
 * as they are; `undefined` when the check read nothing for it.
 */
export function changedValueText(value: string | number | boolean | null | undefined) {
  if (value === undefined) return undefined;
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}
