import { createGoogleRoutes, type GoogleSetupPorts } from "@halonicjs/host-server";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { disconnectBody } from "./google-schemas.ts";

/** What the Google routes reach. */
export interface GoogleRouteDeps {
  google: GoogleSetupPorts;
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
 * `POST /v1/google/disconnect` with `{ accountRef }` runs the same handler as
 * `POST /api/google/setups/<ref>/disconnect` of the CLI's host
 * (`@halonicjs/host-server`): it asks Google to end the sign-in, then removes
 * the refresh token, the record and the client secret (not while another
 * account uses the client), and answers `{ disconnected, googleConfirmed,
 * clientSecret }`, or 404 `google_setup_not_found` in the host's error shape. The host builds the path
 * from the ref itself, so the request names no path. Any other failure
 * answers 502 `google_failed` with a fixed message: the error's own text can
 * hold paths, so it goes only to the host's log.
 */
export function googleRoutes(deps: GoogleRouteDeps): HostRoute[] {
  const handler = createGoogleRoutes({ google: deps.google });
  return [
    {
      method: "POST",
      path: "/v1/google/disconnect",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, disconnectBody);
        if (body === undefined) return;
        try {
          const answer = await handler.handle(
            new Request(`http://127.0.0.1/api/google/setups/${body.accountRef}/disconnect`, {
              method: "POST",
            }),
            new Uint8Array(),
            {},
          );
          if (answer.ok) {
            sendJson(response, answer.status, await answer.json());
            return;
          }
          // The handler's `{ code, message }` in the host's one error shape.
          const refusal = (await answer.json()) as { code: string; message: string };
          sendError(response, answer.status, refusal.code, refusal.message);
        } catch (error) {
          const name = error instanceof Error ? error.name : "Error";
          const detail = error instanceof Error ? error.message : String(error);
          deps.log?.(`A Google request failed (${name}): ${detail}\n`);
          sendError(response, 502, "google_failed", googleFailedMessage);
        }
      },
    },
  ];
}
