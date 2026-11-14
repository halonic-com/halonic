import type { SetupRecord } from "@halonicjs/google-setup";
import type { GoogleSetupPorts, GoogleSignInOutcome } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { isLoopbackRequest } from "./security.ts";

/**
 * Where Google sends the browser back to. It sits outside the sign-in on
 * purpose: the browser that finishes a sign-in on the desktop may not be the
 * one that holds a session, and the `state` only the started sign-in knows is
 * the proof. The request log records this path without its query string.
 */
export const googleCallbackPath = "/api/google/callback";

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

/** The callback page: plain HTML with no script and no query-dependent text, so nothing Google or an attacker sent is shown. */
function callbackPage(outcome: GoogleSignInOutcome): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Halonic</title></head><body><p>${pageTexts[outcome.kind]}</p><p><a href="/">Back to Halonic</a></p></body></html>`;
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
  /** `GET /api/google/callback`: finishes the sign-in Google's redirect belongs to, records how it ended and tells the open item. */
  callback(request: Request): Promise<Response>;
}

/** The sign-in start and the loopback callback of the Google setup routes. */
export function createGoogleSignInRoutes({
  google,
}: {
  readonly google: GoogleSetupPorts;
}): GoogleSignInRoutes {
  const { setups, source, actions, signInEvents } = google;

  /** Keeps how the sign-in ended on the record: the token's account and the checks, or that the sign-in is over. */
  async function record(outcome: GoogleSignInOutcome): Promise<void> {
    if (outcome.kind === "linkNoLongerValid") {
      return;
    }
    if (outcome.kind !== "signedIn") {
      await setups.update(outcome.accountRef, { kind: "sign-in-dropped" });
      return;
    }
    await setups.update(outcome.accountRef, { kind: "signed-in" });
    for (const { service, result } of outcome.services) {
      await setups.update(outcome.accountRef, { kind: "service-checked", service, result });
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
      return Response.json({ authUrl });
    },

    async callback(request) {
      const outcome = await actions.finishSignIn(new URL(request.url).searchParams);
      await record(outcome);
      signInEvents.publish(outcome);
      return callbackPage(outcome);
    },
  };
}
