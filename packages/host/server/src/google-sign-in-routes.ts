import {
  refreshTokenName,
  type SetupRecord,
  SetupRecordError,
  type SignInEnding,
} from "@halonicjs/google-setup";
import type { GoogleSetupPorts, GoogleSignInOutcome } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { isLoopbackRequest } from "./security.ts";
import type { WrongAccountNotes } from "./wrong-account-notes.ts";

/**
 * Where Google sends the browser back to. It sits outside the sign-in on
 * purpose: the browser that finishes a sign-in on the desktop may not be the
 * one that holds a session, and the `state` only the started sign-in knows is
 * the proof. The request log records this path without its query string.
 */
export const googleCallbackPath = "/api/google/callback";

/** The outcomes the record names for Studio's step 7, and the word it keeps for each. Any other way a sign-in ends only drops it. */
const recordedEndings: Readonly<Partial<Record<GoogleSignInOutcome["kind"], SignInEnding>>> = {
  cancelled: "cancelled",
  wrongClientSecret: "secretRefused",
  adminBlocked: "adminBlocked",
};

/** What the callback page tells the person for each way a sign-in can end. Fixed text: nothing of the request or of Google's answer goes in. */
const pageTexts: Readonly<Record<GoogleSignInOutcome["kind"], string>> = {
  signedIn: "You are signed in. You can close this tab and go back to Halonic.",
  wrongAccount:
    "Google signed in a different account than the one this connector is for. Nothing was saved. Go back to Halonic to choose what to do.",
  cancelled: "You cancelled the sign-in. Nothing was saved. You can close this tab.",
  adminBlocked:
    "Your organisation's admin hasn't allowed this app yet. Nothing was saved. Go back to Halonic for what to do.",
  outsideOrganisation:
    "This app only accepts accounts of its own organisation. Nothing was saved. Go back to Halonic for what to do.",
  linkNoLongerValid: "This sign-in link is no longer valid. Go back to Halonic and sign in again.",
  googleError: "Google reported a problem with the sign-in. Go back to Halonic and sign in again.",
  incompleteCallback: "Google's answer was incomplete. Go back to Halonic and sign in again.",
  wrongClientSecret:
    "Google doesn't accept the saved client secret. Go back to Halonic and paste the current one.",
  codeRefused: "Google refused the sign-in code. Go back to Halonic and sign in again.",
  noRefreshToken: "Google gave no long-lasting sign-in. Go back to Halonic and sign in again.",
  noClientSecret: "No client secret is saved. Go back to Halonic and save it first.",
  unreachable: "Halonic couldn't reach Google. Go back to Halonic and sign in again.",
  idTokenRefused: "Google's answer couldn't be checked. Go back to Halonic and sign in again.",
  unexpectedAnswer:
    "Google answered in a way Halonic doesn't know. Go back to Halonic and sign in again.",
};

/** Makes a host-set text safe inside an HTML text or a quoted attribute. */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** The callback page: plain HTML with no script and no query-dependent text, so nothing Google or an attacker sent is shown. */
function callbackPage(
  outcome: GoogleSignInOutcome,
  link: GoogleSetupPorts["callbackPageLink"],
): Response {
  const linkHtml =
    link === undefined
      ? ""
      : `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Halonic</title></head><body><p>${pageTexts[outcome.kind]}</p>${linkHtml}</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

/** The port the browser used to reach this server, which is the one Google must send it back to. */
function portOf(request: Request): number {
  const { port, protocol } = new URL(request.url);
  if (port !== "") {
    return Number(port);
  }
  return protocol === "https:" ? 443 : 80;
}

export interface GoogleSignInRoutes {
  /**
   * `POST /api/google/setups/<ref>/sign-in`: starts a sign-in for a setup
   * that has its client ID and secret, and answers with the address to open
   * in the browser. The caller has checked the sign-in, the site and that the
   * setup exists.
   */
  start(request: Request, accountRef: string, record: SetupRecord): Promise<Response>;
  /**
   * `DELETE /api/google/setups/<ref>/sign-in`: Cancel. Drops the account's
   * pending sign-in, so a callback that still arrives is refused, and notes on
   * the record that the sign-in is over. It answers 204 whether or not one was
   * pending. The caller has checked the sign-in, the site and that the setup
   * exists.
   */
  cancel(accountRef: string): Promise<Response>;
  /**
   * `GET /api/google/setups/<ref>/sign-in/wrong-account`: the address the
   * last sign-in came back with when it wasn't the connector's, as
   * `{ signedInAs }`, or 404 `google_wrong_account_not_found` when the note is
   * gone (see `WrongAccountNotes`). It is its own route because the setup
   * answer must stay safe to log and screenshot. The caller has checked the
   * sign-in and that the setup exists.
   */
  wrongAccount(accountRef: string): Promise<Response>;
  /** `GET /api/google/callback`: finishes the sign-in Google's redirect belongs to, records how it ended and tells the open item. */
  callback(request: Request): Promise<Response>;
}

/** The sign-in start and the loopback callback of the Google setup routes. */
export function createGoogleSignInRoutes({
  google,
  wrongAccountNotes,
}: {
  readonly google: GoogleSetupPorts;
  readonly wrongAccountNotes: WrongAccountNotes;
}): GoogleSignInRoutes {
  const { setups, source, actions, signInEvents, tokens, callbackPageLink } = google;

  /** Keeps how the sign-in ended on the record: the token's account and the checks, or that the sign-in is over. */
  async function record(outcome: GoogleSignInOutcome): Promise<void> {
    if (outcome.kind === "linkNoLongerValid") {
      return;
    }
    if (outcome.kind === "wrongAccount") {
      await setups.update(outcome.accountRef, { kind: "wrong-account" });
      wrongAccountNotes.keep(outcome.accountRef, outcome.signedInAs);
      return;
    }
    if (outcome.kind !== "signedIn") {
      const ending = recordedEndings[outcome.kind];
      await setups.update(
        outcome.accountRef,
        ending === undefined ? { kind: "sign-in-dropped" } : { kind: "sign-in-ended", ending },
      );
      return;
    }
    await setups.update(outcome.accountRef, { kind: "signed-in" });
    wrongAccountNotes.clear(outcome.accountRef);
    for (const { service, result } of outcome.services) {
      await setups.update(outcome.accountRef, { kind: "service-checked", service, result });
    }
  }

  /**
   * Whether the setup was deleted between the start and the callback. The
   * finished sign-in has stored a refresh token by then and no record points
   * at it, so it is removed here: left behind, it would sit in the token
   * store with nobody able to disconnect it. Any other failure keeps the
   * token, since the record still names it and Disconnect still finds it.
   */
  async function recordOrRemoveToken(outcome: GoogleSignInOutcome): Promise<boolean> {
    try {
      await record(outcome);
      return true;
    } catch (error) {
      const setupGone = error instanceof SetupRecordError && error.reason === "not-found";
      if (!setupGone || outcome.kind !== "signedIn") {
        throw error;
      }
      await tokens.remove(refreshTokenName(outcome.accountRef));
      return false;
    }
  }

  return {
    async start(request, accountRef, setup) {
      // A Desktop-app client takes only loopback addresses, so the browser must come back to this computer.
      if (!isLoopbackRequest(request)) {
        return errorResponse(serverErrors.signInNeedsThisComputer);
      }
      const subject = await source.describe(accountRef);
      if (subject === null) {
        return errorResponse(serverErrors.googleSetupNotFound);
      }
      if (setup.clientSecret === null || setup.clientId === null) {
        return errorResponse(serverErrors.googleSetupIncomplete);
      }
      const authUrl = await actions.startSignIn({
        accountRef,
        clientId: setup.clientId,
        clientRef: setup.clientSecret.clientRef,
        redirect: { port: portOf(request), path: googleCallbackPath },
        account: subject.account,
        services: subject.services,
        ...(setup.projectId === null ? {} : { projectId: setup.projectId }),
      });
      await setups.update(accountRef, { kind: "sign-in-started" });
      wrongAccountNotes.clear(accountRef);
      return Response.json({ authUrl });
    },

    async cancel(accountRef) {
      await actions.dropSignIn(accountRef);
      await setups.update(accountRef, { kind: "sign-in-dropped" });
      return new Response(null, { status: 204 });
    },

    async wrongAccount(accountRef) {
      const signedInAs = wrongAccountNotes.read(accountRef);
      if (signedInAs === null) {
        return errorResponse(serverErrors.googleWrongAccountNotFound);
      }
      return Response.json({ signedInAs });
    },

    async callback(request) {
      const outcome = await actions.finishSignIn(new URL(request.url).searchParams);
      // Tell the open item first: the sign-in has ended whether or not the record can still be updated (the setup may be gone).
      // A link that is no longer valid has no account and anyone can cause it, so only the page says it.
      if (outcome.kind !== "linkNoLongerValid") {
        signInEvents.publish(outcome);
      }
      const recorded = await recordOrRemoveToken(outcome);
      // A sign-in whose setup is gone saved nothing, so the page must not say "signed in".
      return callbackPage(recorded ? outcome : { kind: "linkNoLongerValid" }, callbackPageLink);
    },
  };
}
