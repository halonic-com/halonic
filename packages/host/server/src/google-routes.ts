import {
  type SetupRecord,
  SetupRecordError,
  savedConnectorState,
  setupSteps,
  startOver,
} from "@halonicjs/google-setup";
import type { GoogleCheckOutcome, GoogleSetupPorts, RequestContext } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { createGoogleSignInRoutes } from "./google-sign-in-routes.ts";
import { checkSecretRequest, refuseOtherSite } from "./secret-request.ts";

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
type GoogleRoutePorts = { readonly google: GoogleSetupPorts };

export function createGoogleRoutes({ google }: GoogleRoutePorts): GoogleRoutes {
  const { setups, clientSecrets, source, tokens, actions } = google;
  const signInRoutes = createGoogleSignInRoutes({ google });

  /** The record, or `null` when there is none or the ref isn't one. A damaged record is an error for the caller. */
  async function readSetup(accountRef: string): Promise<SetupRecord | null> {
    try {
      return await setups.read(accountRef);
    } catch (error) {
      if (error instanceof SetupRecordError && error.reason === "not-found") {
        return null;
      }
      throw error;
    }
  }

  /** `GET /api/google/setups/<ref>`: the progress and the steps. Nothing secret is in it, and not even the secret's ref. */
  async function show(accountRef: string): Promise<Response> {
    const record = await readSetup(accountRef);
    const subject = record === null ? null : await source.describe(accountRef);
    if (record === null || subject === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    const steps = setupSteps({
      route: record.route,
      accountType: record.accountType,
      account: subject.account,
      ...(record.projectId === null ? {} : { projectId: record.projectId }),
      services: subject.services,
    });
    return Response.json({
      accountRef,
      accountType: record.accountType,
      startedAt: record.startedAt,
      projectId: record.projectId,
      stepsDone: record.stepsDone,
      inProductionTickedAt: record.inProductionTickedAt,
      clientId: record.clientId,
      clientSecretSavedAt: record.clientSecret?.savedAt ?? null,
      signInStartedAt: record.signInStartedAt,
      lastSignInAt: record.lastSignInAt,
      services: record.services,
      problem: savedConnectorState(record),
      steps,
    });
  }

  /**
   * `PUT /api/google/setups/<ref>/secret`: keeps the first secret of a setup,
   * or replaces it while the account has never signed in, since then there is
   * nothing to break and nothing to test the new secret with. Once the
   * account has signed in, or another account uses the same client, a new
   * secret goes through staging instead, so a wrong one never replaces a
   * working one. Every answer is fixed text: no part of the request or of an
   * error is echoed.
   */
  async function saveSecret(
    request: Request,
    body: Uint8Array,
    context: RequestContext,
    accountRef: string,
  ): Promise<Response> {
    const secret = checkSecretRequest(request, body, context);
    if (!secret.ok) {
      return errorResponse(secret.error);
    }
    const record = await readSetup(accountRef);
    if (record === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    if (record.clientSecret === null) {
      const clientRef = await clientSecrets.saveClientSecret(secret.clientSecret);
      await setups.update(accountRef, { kind: "client-secret-saved", clientRef });
      return Response.json({ saved: true });
    }
    const { clientRef } = record.clientSecret;
    if (await secretNeedsStaging(record, clientRef)) {
      return errorResponse(serverErrors.secretNeedsStaging);
    }
    await clientSecrets.replaceClientSecret(clientRef, secret.clientSecret);
    await setups.update(accountRef, { kind: "client-secret-saved", clientRef });
    return Response.json({ saved: true });
  }

  /** Whether a new secret must be checked with Google first: someone signed in with this client, or another account shares it. */
  async function secretNeedsStaging(record: SetupRecord, clientRef: string): Promise<boolean> {
    return record.lastSignInAt !== null || (await setups.usingClient(clientRef)).length > 1;
  }

  /**
   * `PUT /api/google/setups/<ref>/secret/staged`: keeps a new secret apart
   * from the one in use until Google has accepted it (design 4.3). The secret
   * in use doesn't change. The answer is the same fixed text as for a save.
   */
  async function stageSecret(
    request: Request,
    body: Uint8Array,
    context: RequestContext,
    accountRef: string,
  ): Promise<Response> {
    const secret = checkSecretRequest(request, body, context);
    if (!secret.ok) {
      return errorResponse(secret.error);
    }
    const record = await readSetup(accountRef);
    if (record === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    if (record.clientSecret === null) {
      return errorResponse(serverErrors.secretNotSaved);
    }
    const { clientRef } = record.clientSecret;
    if (!(await secretNeedsStaging(record, clientRef))) {
      return errorResponse(serverErrors.secretNeedsNoStaging);
    }
    await clientSecrets.stageClientSecret(clientRef, secret.clientSecret);
    return Response.json({ staged: true });
  }

  /**
   * The account whose refresh token tests a staged secret: this one, or else
   * any account that signed in with the same client, since the refresh token
   * belongs to the client and a shared client has one secret.
   */
  async function accountToTestWith(record: SetupRecord, clientRef: string): Promise<string> {
    if (record.lastSignInAt !== null) {
      return record.accountRef;
    }
    const signedIn = (await setups.usingClient(clientRef)).find(
      (other) => other.lastSignInAt !== null,
    );
    return signedIn?.accountRef ?? record.accountRef;
  }

  /**
   * `POST /api/google/setups/<ref>/secret/staged/check`: tests the staged
   * secret with one refresh, then promotes it when Google accepts it and
   * discards it when Google refuses it (design 4.3). Other outcomes leave
   * both secrets as they are. The answer says which one happened, never more.
   */
  async function checkStagedSecret(request: Request, accountRef: string): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const record = await readSetup(accountRef);
    if (record === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    if (record.clientSecret === null || record.clientId === null) {
      return errorResponse(serverErrors.googleSetupIncomplete);
    }
    const { clientRef } = record.clientSecret;
    const testAccountRef = await accountToTestWith(record, clientRef);
    const result = await actions.checkStagedSecret({
      accountRef: testAccountRef,
      clientId: record.clientId,
      clientRef,
    });
    switch (result.kind) {
      case "accepted": {
        await clientSecrets.promote(clientRef);
        const cleared = await setups.clientSecretAccepted(clientRef);
        return Response.json({
          result: "accepted",
          accountsFixed: cleared.map((fixed) => fixed.accountRef),
        });
      }
      case "refused":
        await clientSecrets.discard(clientRef);
        await markClientGoneIfRefusedBefore(testAccountRef, clientRef);
        return Response.json({ result: "refused" });
      case "signInRefused":
        await setups.refreshRefused(testAccountRef, result);
        return Response.json({ result: result.kind });
      default:
        return Response.json({ result: result.kind });
    }
  }

  /**
   * A staged secret Google refused means the client is gone only when the old
   * secret was refused too. Otherwise the old secret still works, and nothing
   * is marked: marking would turn a typo into "Needs new secret".
   */
  async function markClientGoneIfRefusedBefore(
    accountRef: string,
    clientRef: string,
  ): Promise<void> {
    const sharing = await setups.usingClient(clientRef);
    if (sharing.some((other) => other.refreshRefused?.reason === "client")) {
      await setups.refreshRefused(accountRef, { kind: "clientRefused" });
    }
  }

  /** `DELETE /api/google/setups/<ref>/secret/staged`: drops the staged secret. The secret in use stays. */
  async function discardStagedSecret(request: Request, accountRef: string): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const record = await readSetup(accountRef);
    if (record === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    if (record.clientSecret !== null) {
      await clientSecrets.discard(record.clientSecret.clientRef);
    }
    return Response.json({ discarded: true });
  }

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
    const record = await readSetup(accountRef);
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
    if ((await readSetup(accountRef)) === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    const revoked = await actions.revoke(accountRef);
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
    const record = await readSetup(accountRef);
    if (record === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    return signInRoutes.start(request, accountRef, record);
  }

  return {
    callback: (request) => signInRoutes.callback(request),
    async handle(request, body, context) {
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith(setupsPrefix)) {
        return errorResponse(serverErrors.notFound);
      }
      const [accountRef = "", ...action] = pathname.slice(setupsPrefix.length).split("/");
      const endpoint = `${request.method} /${action.join("/")}`;
      switch (endpoint) {
        case "GET /":
          return show(accountRef);
        case "PUT /secret":
          return saveSecret(request, body, context, accountRef);
        case "PUT /secret/staged":
          return stageSecret(request, body, context, accountRef);
        case "POST /secret/staged/check":
          return checkStagedSecret(request, accountRef);
        case "DELETE /secret/staged":
          return discardStagedSecret(request, accountRef);
        case "POST /check":
          return checkAgain(request, accountRef);
        case "POST /sign-in":
          return startSignIn(request, accountRef);
        case "POST /disconnect":
          return disconnect(request, accountRef);
        default:
          return errorResponse(serverErrors.notFound);
      }
    },
  };
}
