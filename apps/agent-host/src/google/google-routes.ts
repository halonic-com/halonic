import type { IncomingMessage, ServerResponse } from "node:http";
import { createGoogleRoutes, type GoogleSetupPorts } from "@halonicjs/host-server";
import { type Clock, systemClock } from "@halonicjs/std";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { accountRefBody } from "./google-schemas.ts";

/** What the Google routes reach. */
export interface GoogleRouteDeps {
  google: GoogleSetupPorts;
  /** Times how long the host keeps a wrong-account sign-in; the host's own clock unless a test sets one. */
  clock?: Clock;
  /** Where the host writes what it keeps from a failure; the answer never carries it. */
  log?: (text: string) => void;
}

const googleFailedMessage =
  "The agent host couldn't finish this Google request. Its log has the detail.";

/**
 * Studio's changes to a Google setup in the desktop app, over loopback. The
 * page never holds a token or a client secret: the host, which sealed them,
 * is the one that opens them (docs/adr/2026-11-14-google-sign-in-and-the-setup-record.md).
 *
 * Each route names the account by its ref only, and runs the same handler as
 * the CLI's host (`@halonicjs/host-server`) for the path it builds itself, so
 * the request names no path. The handler answers in the host's error shape
 * (404 `google_setup_not_found`, for one). Any other failure answers 502
 * `google_failed` with a fixed message: the error's own text can hold paths,
 * so it goes only to the host's log.
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
 */
export function googleRoutes(deps: GoogleRouteDeps): HostRoute[] {
  const handler = createGoogleRoutes({ google: deps.google, clock: deps.clock ?? systemClock });

  /** A route that sends `method` to the setup's `suffix` path and relays the handler's answer. */
  function setupRoute(path: string, method: "POST" | "DELETE", suffix: string): HostRoute {
    return {
      method: "POST",
      path,
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, accountRefBody);
        if (body === undefined) return;
        try {
          const answer = await handler.handle(
            // A built request has no `Host` header, and the handler tells a loopback request by it.
            // This server listens on loopback only, so the name is true.
            new Request(
              `http://127.0.0.1:${portOf(request)}/api/google/setups/${body.accountRef}/${suffix}`,
              { method, headers: { host: `127.0.0.1:${portOf(request)}` } },
            ),
            new Uint8Array(),
            {},
          );
          await relay(response, answer);
        } catch (error) {
          const name = error instanceof Error ? error.name : "Error";
          const detail = error instanceof Error ? error.message : String(error);
          deps.log?.(`A Google request failed (${name}): ${detail}\n`);
          sendError(response, 502, "google_failed", googleFailedMessage);
        }
      },
    };
  }

  return [
    setupRoute("/v1/google/disconnect", "POST", "disconnect"),
    setupRoute("/v1/google/sign-in", "POST", "sign-in"),
    setupRoute("/v1/google/sign-in/cancel", "DELETE", "sign-in"),
  ];
}

/** The port this host serves on, which Google must send the browser back to. */
function portOf(request: IncomingMessage): number {
  return request.socket.localPort ?? 80;
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
