import { startOver } from "@halonicjs/google-setup";
import type { Clock } from "@halonicjs/ports";
import type {
  GoogleCheckOutcome,
  GoogleSetupPorts,
  GoogleSetupReadPorts,
  RequestContext,
} from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { createGoogleReadRoutes } from "./google-read-routes.ts";
import { readSetup } from "./google-read-setup.ts";
import { createGoogleSecretRoutes } from "./google-secret-routes.ts";
import { createGoogleSetupWriteRoutes } from "./google-setup-write-routes.ts";
import { createGoogleSignInRoutes } from "./google-sign-in-routes.ts";
import { refuseOtherSite } from "./secret-request.ts";
import { WrongAccountNotes } from "./wrong-account-notes.ts";

/** Every Google setup route starts with this path. */
export const googlePathPrefix = "/api/google/";

const setupsPrefix = `${googlePathPrefix}setups/`;

/**
 * Whether a path is under a setup's `secret`: the routes that take a client
 * secret and the one that checks a staged one. The request log leaves these
 * out, so no log line says when or how often a secret was sent or checked.
 */
export function isSecretPath(pathname: string): boolean {
  if (!pathname.startsWith(setupsPrefix)) {
    return false;
  }
  const [, secretSegment] = pathname.slice(setupsPrefix.length).split("/");
  return secretSegment === "secret";
}

export interface GoogleRoutes {
  /**
   * Answers a request under `/api/google/`. The caller has already checked
   * the host, the origin, the daily ceiling and the body size, and the
   * sign-in.
   */
  handle(request: Request, body: Uint8Array, context: RequestContext): Promise<Response>;
  /**
   * Answers Google's redirect to `googleCallbackPath`. The caller has checked
   * the host and the body size but not the sign-in: the `state` is the proof.
   */
  callback(request: Request): Promise<Response>;
}

/** The ports the Google routes work with. */
type GoogleRoutePorts = { readonly google: GoogleSetupPorts; readonly clock: Clock };

export function createGoogleRoutes({ google, clock }: GoogleRoutePorts): GoogleRoutes {
  const { setups, clientSecrets, source, tokens, actions } = google;
  const readRoutes = createGoogleReadRoutes(google);
  const wrongAccountNotes = new WrongAccountNotes(clock);
  const signInRoutes = createGoogleSignInRoutes({ google, wrongAccountNotes });

  const secretRoutes = createGoogleSecretRoutes({ google });
  const writeRoutes = createGoogleSetupWriteRoutes({ google, wrongAccountNotes });

  /**
   * `POST /api/google/setups/<ref>/check`: Check again (design 3.5, item 7).
   * Refreshes the access token, checks each ticked service and saves what it
   * found on the record. A refused refresh is saved too, so no run asks
   * Google again.
   */
  async function checkAgain(request: Request, accountRef: string): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const record = await readSetup(setups, accountRef);
    const subject = record === null ? null : await source.describe(accountRef);
    if (record === null || subject === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    if (record.clientSecret === null || record.clientId === null) {
      return errorResponse(serverErrors.googleSetupIncomplete);
    }
    const result = await actions.checkAgain({
      accountRef,
      clientId: record.clientId,
      clientRef: record.clientSecret.clientRef,
      services: subject.services,
      ...(record.projectId === null ? {} : { projectId: record.projectId }),
      refreshRefused: record.refreshRefused,
    });
    return saveCheckAgainResult(accountRef, result);
  }

  /** Keeps what a check found on the record, and answers with it. A refused refresh is kept too, so no run asks Google again. */
  async function saveCheckAgainResult(
    accountRef: string,
    result: GoogleCheckOutcome,
  ): Promise<Response> {
    switch (result.kind) {
      case "checked":
        for (const { service, result: outcome } of result.services) {
          await setups.update(accountRef, { kind: "service-checked", service, result: outcome });
        }
        return Response.json({ result: "checked", services: result.services });
      case "signInRefused":
      case "clientRefused":
        await setups.refreshRefused(accountRef, result);
        return Response.json({ result: result.kind });
      default:
        return Response.json({ result: result.kind });
    }
  }

  /**
   * `POST /api/google/setups/<ref>/disconnect`: asks Google to end the
   * sign-in, then removes the refresh token, the record and the client secret
   * (not while another account uses the client). It removes the token whether
   * or not Google answers, and says whether Google confirmed.
   */
  async function disconnect(request: Request, accountRef: string): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    if ((await readSetup(setups, accountRef)) === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    const revoked = await actions.revoke(accountRef);
    wrongAccountNotes.clear(accountRef);
    const secret = await startOver({ setups, secrets: clientSecrets, tokens }, accountRef);
    return Response.json({
      disconnected: true,
      googleConfirmed: revoked.kind === "disconnected" && revoked.googleConfirmed,
      clientSecret: secret,
    });
  }

  /** `POST /api/google/setups/<ref>/sign-in`: starts the sign-in, see `start` in `createGoogleSignInRoutes`. */
  async function startSignIn(request: Request, accountRef: string): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const record = await readSetup(setups, accountRef);
    if (record === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    return signInRoutes.start(request, accountRef, record);
  }

  /** `DELETE /api/google/setups/<ref>/sign-in`: Cancel, see `cancel` in `createGoogleSignInRoutes`. */
  async function cancelSignIn(request: Request, accountRef: string): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    if ((await readSetup(setups, accountRef)) === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    return signInRoutes.cancel(accountRef);
  }

  /** `GET /api/google/setups/<ref>/sign-in/wrong-account`: see `wrongAccount` in `createGoogleSignInRoutes`. */
  async function wrongAccount(accountRef: string): Promise<Response> {
    if ((await readSetup(setups, accountRef)) === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    return signInRoutes.wrongAccount(accountRef);
  }

  return {
    callback: (request) => signInRoutes.callback(request),
    async handle(request, body, context) {
      const { pathname } = new URL(request.url);
      if (pathname === setupsPrefix.slice(0, -1)) {
        if (request.method === "GET") {
          return readRoutes.list(request, context);
        }
        if (request.method === "POST") {
          return writeRoutes.start(request, body);
        }
      }
      if (!pathname.startsWith(setupsPrefix)) {
        return errorResponse(serverErrors.notFound);
      }
      const [accountRef = "", ...action] = pathname.slice(setupsPrefix.length).split("/");
      const endpoint = `${request.method} /${action.join("/")}`;
      switch (endpoint) {
        case "GET /":
          return readRoutes.show(accountRef);
        case "PATCH /":
          return writeRoutes.edit(request, body, accountRef);
        case "POST /start-over":
          return writeRoutes.startOver(request, accountRef);
        case "PUT /secret":
          return secretRoutes.save(request, body, context, accountRef);
        case "PUT /secret/staged":
          return secretRoutes.stage(request, body, context, accountRef);
        case "POST /secret/staged/check":
          return secretRoutes.checkStaged(request, accountRef);
        case "DELETE /secret/staged":
          return secretRoutes.discardStaged(request, accountRef);
        case "POST /check":
          return checkAgain(request, accountRef);
        case "POST /sign-in":
          return startSignIn(request, accountRef);
        case "DELETE /sign-in":
          return cancelSignIn(request, accountRef);
        case "GET /sign-in/wrong-account":
          return wrongAccount(accountRef);
        case "POST /disconnect":
          return disconnect(request, accountRef);
        default:
          return errorResponse(serverErrors.notFound);
      }
    },
  };
}

/**
 * The Google routes of a host that can show setups but not change them: `GET` of the list and of
 * one setup. Every other route under `/api/google/`, and Google's redirect, answers 404.
 */
export function createGoogleReadOnlyRoutes(read: GoogleSetupReadPorts): GoogleRoutes {
  const routes = createGoogleReadRoutes(read);
  return {
    callback: async () => errorResponse(serverErrors.notFound),
    async handle(request, _body, context) {
      const { pathname } = new URL(request.url);
      if (request.method === "GET" && pathname === setupsPrefix.slice(0, -1)) {
        return routes.list(request, context);
      }
      const [accountRef = "", ...rest] = pathname.startsWith(setupsPrefix)
        ? pathname.slice(setupsPrefix.length).split("/")
        : [""];
      return request.method === "GET" && accountRef !== "" && rest.length === 0
        ? routes.show(accountRef)
        : errorResponse(serverErrors.notFound);
    },
  };
}
