import type { IncomingMessage, ServerResponse } from "node:http";
import { createGoogleRoutes, type GoogleSetupPorts } from "@halonicjs/host-server";
import type { Schema } from "@halonicjs/schema-kit";
import { type Clock, systemClock } from "@halonicjs/std";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { accountRefBody, editSetupBody, startSetupBody } from "./google-schemas.ts";
import { googleSecretRoutes, type HandlerCall } from "./google-secret-routes.ts";

/** What the Google routes reach. */
export interface GoogleRouteDeps {
  google: GoogleSetupPorts;
  /** Times how long the host keeps a wrong-account sign-in; the host's own clock unless a test sets one. */
  clock?: Clock;
  /** Where the host writes what it keeps from a failure; the answer never carries it. */
  log?: (text: string) => void;
  /**
   * Set when the host serves over frames: the port of Studio's relay on Windows'
   * loopback, the only address the browser can reach. The sign-in's redirect
   * names this port and {@link relayCallbackPath}, and the callback is served there.
   * Absent when the host listens on its own port.
   */
  relayPort?: number;
}

/**
 * Where Google sends the browser back to: the path `host-server` puts in the
 * sign-in's redirect address. It isn't exported from there, so the test that
 * follows a started sign-in's redirect address is what keeps the two equal.
 */
const googleCallbackPath = "/api/google/callback";

/**
 * Where Google sends the browser back to in relay mode. It is the one path
 * Studio's relay passes on without the launch token (`relay-callback.md` of
 * the agent-host crate), so the redirect and the route must both use it.
 */
export const relayCallbackPath = "/v1/google/callback";

const setupsPath = "/api/google/setups";

const googleFailedMessage =
  "The agent host couldn't finish this Google request. Its log has the detail.";

/** What the browser shows when finishing the sign-in failed: fixed text, never the error's. */
const callbackFailedPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Halonic</title></head><body><p>The agent host couldn't finish the sign-in. Go back to Halonic and try again.</p></body></html>`;

/**
 * Studio's changes to a Google setup in the desktop app, over loopback. The
 * page never holds a token or a client secret: the host, which sealed them,
 * is the one that opens them (docs/adr/2026-11-14-google-sign-in-and-the-setup-record.md).
 *
 * Each route names the account by its ref only, and runs the same handler as
 * the CLI's host (`@halonicjs/host-server`) for the path it builds itself, so
 * the request names no path. The handler answers in the host's error shape
 * (404 `google_setup_not_found`, for one). Any other failure answers 502
 * `google_failed` with a fixed message, except on the sign-in callback, which
 * answers a fixed HTML page because a browser shows it: the error's own text
 * can hold paths, so it goes only to the host's log.
 *
 * - `POST /v1/google/disconnect` with `{ accountRef }`: asks Google to end the
 *   sign-in, then removes the refresh token, the record and the client secret
 *   (not while another account uses the client). Answers `{ disconnected,
 *   googleConfirmed, clientSecret }`.
 * - `POST /v1/google/sign-in` with `{ accountRef }`: starts the sign-in and
 *   answers `{ authUrl }`, the address to open in the browser. Google's
 *   redirect comes back to this host's own port.
 * - `POST /v1/google/sign-in/cancel` with `{ accountRef }`: drops the pending
 *   sign-in and answers 204, whether or not one was pending.
 * - `POST /v1/google/setups` with `{ accountType, connector: { workspace, id } }`:
 *   starts a record for that connector and answers 201 `{ accountRef }`.
 * - `POST /v1/google/setups/edit` with `{ accountRef, change }`: applies one
 *   edit a person makes (`change` is the handler's own edit body) and answers
 *   `{ updated: true }`.
 * - `POST /v1/google/start-over` with `{ accountRef }`: removes the record,
 *   the refresh token and the client secret without asking Google, starts a
 *   fresh record for the same connector, and answers `{ clientSecret, accountRef }`.
 * - `POST /v1/google/secret` and `POST /v1/google/secret/replace` with
 *   `{ accountRef, clientSecret }`: save a client secret, and replace one in use
 *   after Google has checked it ({@link googleSecretRoutes}).
 * - `GET /api/google/callback`: where Google sends the browser back. The
 *   browser has no launch token, so this one route is `tokenFree`; the
 *   sign-in's own `state` is the proof, and the page it answers with is fixed
 *   text. The same-host check of the server still applies.
 */
export function googleRoutes(deps: GoogleRouteDeps): HostRoute[] {
  const handler = createGoogleRoutes({
    google: inRelayMode(deps.google, deps.relayPort),
    clock: deps.clock ?? systemClock,
  });
  /** The port Google must send the browser back to, and the `Host` a request to it names. */
  const portOf = (request: IncomingMessage): number =>
    // `?? 80` only matters on a socket that has already closed, where no
    // request is being answered anyway. Over frames there is no socket port.
    deps.relayPort ?? request.socket.localPort ?? 80;

  /** Keeps what failed in the host's log only: the error's text can hold paths. */
  function logFailure(error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    deps.log?.(`A Google request failed (${errorName(error)}): ${detail}\n`);
  }

  /**
   * Runs the handler for `call` with a request built here: its own `Host`, so the
   * handler tells it is on loopback, and its own `content-type`. This server
   * listens on loopback only, so the name is true. Nothing of the page's
   * request is forwarded, not even a header.
   */
  function callHandler(request: IncomingMessage, call: HandlerCall): Promise<Response> {
    const host = `127.0.0.1:${portOf(request)}`;
    return handler.handle(
      new Request(`http://${host}${call.path}`, {
        method: call.method,
        headers: { host, "content-type": "application/json" },
      }),
      call.payload === undefined
        ? new Uint8Array()
        : new TextEncoder().encode(JSON.stringify(call.payload)),
      {},
    );
  }

  /**
   * A route that checks its body with `schema`, sends what `forward` names to
   * the handler and relays the handler's answer.
   */
  function forwardRoute<Body>(
    path: string,
    schema: Schema<Body>,
    forward: (body: Body) => HandlerCall,
  ): HostRoute {
    return {
      method: "POST",
      path,
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, schema);
        if (body === undefined) return;
        try {
          await relay(response, await callHandler(request, forward(body)));
        } catch (error) {
          logFailure(error);
          sendError(response, 502, "google_failed", googleFailedMessage);
        }
      },
    };
  }

  /** A route that sends `method` to the setup's `suffix` path and relays the handler's answer. */
  function setupRoute(path: string, method: "POST" | "DELETE", suffix: string): HostRoute {
    return forwardRoute(path, accountRefBody, ({ accountRef }) => ({
      method,
      path: `${setupsPath}/${accountRef}/${suffix}`,
    }));
  }

  /** Google's redirect, as the handler's own callback answers it, page and all. */
  const callbackRoute: HostRoute = {
    method: "GET",
    path: deps.relayPort === undefined ? googleCallbackPath : relayCallbackPath,
    tokenFree: true,
    handle: async (request, response) => {
      try {
        const answer = await handler.callback(
          new Request(`http://127.0.0.1:${portOf(request)}${request.url ?? ""}`, {
            headers: { host: `127.0.0.1:${portOf(request)}` },
          }),
        );
        response.writeHead(answer.status, callbackPageHeaders);
        response.end(await answer.text());
      } catch (error) {
        logFailure(error);
        // A browser tab, not a script, asked: a page says it where JSON would show raw text.
        response.writeHead(502, callbackPageHeaders);
        response.end(callbackFailedPage);
      }
    },
  };

  return [
    callbackRoute,
    setupRoute("/v1/google/disconnect", "POST", "disconnect"),
    setupRoute("/v1/google/sign-in", "POST", "sign-in"),
    setupRoute("/v1/google/sign-in/cancel", "DELETE", "sign-in"),
    setupRoute("/v1/google/start-over", "POST", "start-over"),
    ...googleSecretRoutes({
      callHandler,
      relay,
      setupsPath,
      failedMessage: googleFailedMessage,
      logFailure: (error) =>
        // Only the name: a failure inside a secret route can hold text from the request.
        deps.log?.(`A Google secret request failed (${errorName(error)}).\n`),
    }),
    forwardRoute("/v1/google/setups", startSetupBody, (body) => ({
      method: "POST",
      path: setupsPath,
      payload: body,
    })),
    forwardRoute("/v1/google/setups/edit", editSetupBody, ({ accountRef, change }) => ({
      method: "PATCH",
      path: `${setupsPath}/${accountRef}`,
      payload: change,
    })),
  ];
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

/** Sends the handler's answer: its JSON, nothing for a 204, or its `{ code, message }` in the host's one error shape. */
async function relay(response: ServerResponse, answer: Response): Promise<void> {
  if (answer.status === 204) {
    response.writeHead(204).end();
    return;
  }
  if (answer.ok) {
    sendJson(response, answer.status, await answer.json());
    return;
  }
  const refusal = (await answer.json()) as { code: string; message: string };
  sendError(response, answer.status, refusal.code, refusal.message);
}

/**
 * What the callback page is sent with. The address bar and the history hold
 * the sign-in's code, so the page is never cached and sends no referrer, and
 * it closes the connection: over frames the relay doesn't see the answer end,
 * only the host's `end` frame, and a kept-alive connection would wait out
 * Node's `keepAliveTimeout` (5 s) before the relay closes it.
 */
const callbackPageHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  connection: "close",
};

/**
 * The Google ports, with a sign-in that sends the browser back to
 * {@link relayCallbackPath} when the host serves over frames (`relayPort`
 * set); otherwise as they are. The handler builds the redirect from the
 * request's port and its own fixed path, so the path is changed where the
 * sign-in starts.
 */
function inRelayMode(google: GoogleSetupPorts, relayPort: number | undefined): GoogleSetupPorts {
  if (relayPort === undefined) return google;
  const { startSignIn } = google.actions;
  return {
    ...google,
    actions: {
      ...google.actions,
      startSignIn: (input) =>
        startSignIn({ ...input, redirect: { ...input.redirect, path: relayCallbackPath } }),
    },
  };
}
