import type { SetupRecord } from "@halonicjs/google-setup";
import type { GoogleSetupPorts, RequestContext } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { readSetup } from "./google-read-setup.ts";
import { checkSecretRequest, refuseOtherSite } from "./secret-request.ts";

/** The routes under a setup's `secret`: save, stage, check the staged one, drop it. Each takes the account ref from the path. */
export interface GoogleSecretRoutes {
  save(
    request: Request,
    body: Uint8Array,
    context: RequestContext,
    accountRef: string,
  ): Promise<Response>;
  stage(
    request: Request,
    body: Uint8Array,
    context: RequestContext,
    accountRef: string,
  ): Promise<Response>;
  checkStaged(request: Request, accountRef: string): Promise<Response>;
  discardStaged(request: Request, accountRef: string): Promise<Response>;
}

/** The client secret routes of the Google setup. */
export function createGoogleSecretRoutes({
  google,
}: {
  readonly google: GoogleSetupPorts;
}): GoogleSecretRoutes {
  const { setups, clientSecrets, actions } = google;

  /**
   * `PUT /api/google/setups/<ref>/secret`: keeps the first secret of a setup,
   * or replaces it while the account has never signed in, since then there is
   * nothing to break and nothing to test the new secret with. Once the
   * account has signed in, or another account uses the same client, a new
   * secret goes through staging instead, so a wrong one never replaces a
   * working one. Every answer is fixed text: no part of the request or of an
   * error is echoed.
   */
  async function save(
    request: Request,
    body: Uint8Array,
    context: RequestContext,
    accountRef: string,
  ): Promise<Response> {
    const secret = checkSecretRequest(request, body, context);
    if (!secret.ok) {
      return errorResponse(secret.error);
    }
    const record = await readSetup(setups, accountRef);
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
  async function stage(
    request: Request,
    body: Uint8Array,
    context: RequestContext,
    accountRef: string,
  ): Promise<Response> {
    const secret = checkSecretRequest(request, body, context);
    if (!secret.ok) {
      return errorResponse(secret.error);
    }
    const record = await readSetup(setups, accountRef);
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
  async function checkStaged(request: Request, accountRef: string): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const record = await readSetup(setups, accountRef);
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
  async function discardStaged(request: Request, accountRef: string): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const record = await readSetup(setups, accountRef);
    if (record === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    if (record.clientSecret !== null) {
      await clientSecrets.discard(record.clientSecret.clientRef);
    }
    return Response.json({ discarded: true });
  }

  return { save, stage, checkStaged, discardStaged };
}
