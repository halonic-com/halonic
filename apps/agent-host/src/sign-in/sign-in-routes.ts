import type { IncomingMessage } from "node:http";
import type { SignInHost } from "@halonicjs/host-integration-sign-in";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { integrationBody, signInBody } from "./sign-in-schemas.ts";

/** What the integration sign-in routes reach. */
export interface IntegrationSignInRouteDeps {
  readonly signIns: SignInHost;
  /**
   * Set when the host serves over frames: the port of Studio's relay. The
   * relay passes on without the launch token only the Google callback's path,
   * so a sign-in's random callback path can't reach the host, and a start is
   * refused rather than sent to a browser that can't come back.
   */
  readonly relayPort?: number;
  /** Where the host writes what it keeps from a failure; the answer never carries it. */
  readonly log?: (text: string) => void;
}

/** Where the provider sends the browser back to: `/sign-in/<random>`, a new one for each start. */
export const signInCallbackPrefix = "/sign-in/";

const failedMessage =
  "The agent host couldn't finish this sign-in request. Its log has the detail.";

/** What the browser shows when the callback couldn't be handled: fixed text, never the error's. */
const callbackFailedPage =
  '<!doctype html><meta charset="utf-8"><title>Halonic</title><p>The agent host couldn\'t finish the sign-in. Go back to Halonic and try again.</p>';

/**
 * What the callback page is sent with. The address bar and the history hold
 * the sign-in's code, so the page is never cached, sends no referrer and
 * shows nothing but itself; it closes the connection for the reason the
 * Google callback does.
 */
const callbackPageHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'",
  connection: "close",
};

/**
 * Studio's start, status, cancel and sign-out of an integration's sign-ins in
 * the desktop app, over loopback, and the callback the provider sends the
 * browser back to. Studio opens the authorize URL it is given; the page never
 * holds a code, a token or a client secret.
 *
 * - `POST /v1/integrations/sign-in/start` with `{ integration, signIn }`:
 *   answers `{ authorizeUrl }`. The redirect names this host's own port and a
 *   new random path under {@link signInCallbackPrefix}. 404 `unknown_integration`
 *   or `unknown_sign_in`; 422 `settings_invalid` (a setting the sign-in reads
 *   is missing or wrong) or `client_secret_missing`; 501 `callback_unavailable`
 *   over frames.
 * - `POST /v1/integrations/sign-in/status` with `{ integration }`: answers
 *   `{ signIns: [{ signIn, state, lastOutcome? }] }` (see `SignInStatus`).
 * - `POST /v1/integrations/sign-in/cancel` with `{ integration, signIn }`:
 *   drops the pending sign-in and answers 204, whether or not one was pending.
 * - `POST /v1/integrations/sign-in/sign-out` with `{ integration, signIn }`:
 *   revokes at the approved address and removes the grant; answers `{ result }`
 *   (see `SignOutResult`).
 * - `GET /sign-in/<random>`: where the provider sends the browser back. The
 *   browser has no launch token, so this is a `tokenFree` prefix route; the
 *   sign-in's own `state` is the proof, and a path nobody waits on gets a
 *   plain 400 page. The host server's `Host` and `Origin` checks still apply.
 *
 * Any other failure answers 502 `sign_in_failed` with a fixed message; the
 * error's own name goes to the log, never its text, which can hold a URL.
 */
export function integrationSignInRoutes(deps: IntegrationSignInRouteDeps): HostRoute[] {
  /** The port the provider must send the browser back to. */
  const portOf = (request: IncomingMessage): number => request.socket.localPort ?? 80;

  function logFailure(error: unknown): void {
    const name = error instanceof Error ? error.name : "Error";
    deps.log?.(`An integration sign-in request failed (${name}).\n`);
  }

  const callback: HostRoute = {
    method: "GET",
    path: signInCallbackPrefix,
    prefix: true,
    tokenFree: true,
    handle: async (request, response) => {
      const host = `127.0.0.1:${portOf(request)}`;
      try {
        const answer = await deps.signIns.handleCallback(
          new Request(`http://${host}${request.url ?? ""}`, { headers: { host } }),
        );
        response.writeHead(answer.status, callbackPageHeaders);
        response.end(await answer.text());
      } catch (error) {
        logFailure(error);
        response.writeHead(502, callbackPageHeaders);
        response.end(callbackFailedPage);
      }
    },
  };

  const start: HostRoute = {
    method: "POST",
    path: "/v1/integrations/sign-in/start",
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, signInBody);
      if (body === undefined) return;
      if (deps.relayPort !== undefined) {
        return sendError(
          response,
          501,
          "callback_unavailable",
          "The agent host can't receive a sign-in's callback in this setup yet.",
        );
      }
      const parts = deps.signIns.integration(body.integration);
      if (parts === undefined) return unknownIntegration(response);
      try {
        const started = await parts.flow.start(body.signIn, portOf(request));
        switch (started.kind) {
          case "started":
            return sendJson(response, 200, { authorizeUrl: started.authorizeUrl });
          case "unknown":
            return sendError(
              response,
              404,
              "unknown_sign_in",
              "The integration has no sign-in of this name.",
            );
          case "settingsInvalid":
            return sendError(
              response,
              422,
              "settings_invalid",
              "A setting this sign-in reads is missing or wrong.",
            );
          case "clientSecretMissing":
            return sendError(
              response,
              422,
              "client_secret_missing",
              "The client secret this sign-in needs isn't set.",
            );
        }
      } catch (error) {
        logFailure(error);
        sendError(response, 502, "sign_in_failed", failedMessage);
      }
    },
  };

  const status: HostRoute = {
    method: "POST",
    path: "/v1/integrations/sign-in/status",
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, integrationBody);
      if (body === undefined) return;
      const parts = deps.signIns.integration(body.integration);
      if (parts === undefined) return unknownIntegration(response);
      try {
        sendJson(response, 200, { signIns: await parts.status() });
      } catch (error) {
        logFailure(error);
        sendError(response, 502, "sign_in_failed", failedMessage);
      }
    },
  };

  const cancel: HostRoute = {
    method: "POST",
    path: "/v1/integrations/sign-in/cancel",
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, signInBody);
      if (body === undefined) return;
      const parts = deps.signIns.integration(body.integration);
      if (parts === undefined) return unknownIntegration(response);
      parts.flow.cancel(body.signIn);
      response.writeHead(204).end();
    },
  };

  const signOut: HostRoute = {
    method: "POST",
    path: "/v1/integrations/sign-in/sign-out",
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, signInBody);
      if (body === undefined) return;
      const parts = deps.signIns.integration(body.integration);
      if (parts === undefined) return unknownIntegration(response);
      try {
        sendJson(response, 200, { result: await parts.signIns.signOut(body.signIn) });
      } catch (error) {
        logFailure(error);
        sendError(response, 502, "sign_in_failed", failedMessage);
      }
    },
  };

  return [callback, start, status, cancel, signOut];
}

function unknownIntegration(response: Parameters<typeof sendError>[0]): void {
  sendError(
    response,
    404,
    "unknown_integration",
    "The agent host runs no sign-ins for this integration.",
  );
}
