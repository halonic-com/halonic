import type { IncomingMessage, ServerResponse } from "node:http";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { secretBody } from "./google-schemas.ts";

/** One request to the Google handler, named by its method and its own path. */
export interface HandlerCall {
  method: string;
  path: string;
  payload?: unknown;
}

/** What the secret routes need from the Google routes they sit beside. */
export interface GoogleSecretRouteDeps {
  /** Runs the handler for a request built fresh, with none of the page's headers. */
  callHandler(request: IncomingMessage, call: HandlerCall): Promise<Response>;
  /** Sends the handler's answer to the page. */
  relay(response: ServerResponse, answer: Response): Promise<void>;
  /** The path the handler serves setups under. */
  setupsPath: string;
  /** The fixed text of a 502. */
  failedMessage: string;
  /** Writes what failed to the host's log. It must never be given the error's text. */
  logFailure(error: unknown): void;
}

/** The handler's `secret_needs_staging` refusal: the secret is in use, so Google must check a new one first. */
async function needsStaging(answer: Response): Promise<boolean> {
  if (answer.status !== 409) return false;
  const refusal = (await answer.clone().json()) as { code?: unknown };
  return refusal.code === "secret_needs_staging";
}

/**
 * The routes that save or replace a client secret, over the handler's own
 * (`createGoogleSecretRoutes`). The page sends the secret once and the handler
 * keeps it; nothing here reads it, logs it or answers it.
 *
 * - `POST /v1/google/secret` with `{ accountRef, clientSecret }`: the handler's
 *   save. Answers `{ saved: true }`, or 409 `secret_needs_staging` when the
 *   secret in use must stay until Google has checked a new one.
 * - `POST /v1/google/secret/replace` with the same body: the save first, and
 *   `{ result: "replaced" }` when it keeps the secret. When the secret is in
 *   use, the secret is staged and checked with Google, and the answer is
 *   `{ result }` with the check's own word, plus `accountsFixed` for
 *   `accepted`. The handler promotes or discards the staged secret, or leaves
 *   both as they are; this route does none of it.
 */
export function googleSecretRoutes(deps: GoogleSecretRouteDeps): HostRoute[] {
  const { callHandler, relay, setupsPath, failedMessage, logFailure } = deps;

  /** A route that checks the secret body, runs `run` and answers 502 with fixed text when it throws. */
  function secretRoute(
    path: string,
    run: (
      request: IncomingMessage,
      response: ServerResponse,
      body: { accountRef: string; clientSecret: string },
    ) => Promise<void>,
  ): HostRoute {
    return {
      method: "POST",
      path,
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, secretBody, {
          describeProblems: false,
        });
        if (body === undefined) return;
        try {
          await run(request, response, body);
        } catch (error) {
          logFailure(error);
          sendError(response, 502, "google_failed", failedMessage);
        }
      },
    };
  }

  const secretPath = (accountRef: string) => `${setupsPath}/${accountRef}/secret`;

  return [
    secretRoute("/v1/google/secret", async (request, response, { accountRef, clientSecret }) => {
      const saved = await callHandler(request, {
        method: "PUT",
        path: secretPath(accountRef),
        payload: { clientSecret },
      });
      await relay(response, saved);
    }),
    secretRoute(
      "/v1/google/secret/replace",
      async (request, response, { accountRef, clientSecret }) => {
        const payload = { clientSecret };
        const saved = await callHandler(request, {
          method: "PUT",
          path: secretPath(accountRef),
          payload,
        });
        if (saved.ok) {
          sendJson(response, 200, { result: "replaced" });
          return;
        }
        if (!(await needsStaging(saved))) {
          await relay(response, saved);
          return;
        }
        const staged = await callHandler(request, {
          method: "PUT",
          path: `${secretPath(accountRef)}/staged`,
          payload,
        });
        if (!staged.ok) {
          await relay(response, staged);
          return;
        }
        // The check promotes or discards the staged secret itself; its answer is passed on as it is.
        await relay(
          response,
          await callHandler(request, {
            method: "POST",
            path: `${secretPath(accountRef)}/staged/check`,
          }),
        );
      },
    ),
  ];
}
