import {
  clientSecretName,
  mayRefresh,
  type RefreshAnswerMeaning,
  readRefreshAnswer,
  refreshTokenName,
  type ServiceResult,
  type SetupService,
  type SetupValues,
} from "@halonicjs/google-setup";
import type { Clock, HttpClient, TokenStore } from "@halonicjs/ports";
import { checkGoogleCheckUrl, checkServices } from "./google-check.ts";
import { postTokenForm } from "./token-request.ts";

/** What Check again starts from: the account's setup record and its ticked services. Nothing here is a secret. */
export interface CheckGoogleServicesAgainInput {
  /** The account ref from the setup record. Never an e-mail address. */
  readonly accountRef: string;
  /** The OAuth client ID from the setup record. */
  readonly clientId: string;
  /** The ref of that client's secret. */
  readonly clientRef: string;
  /** The ticked services, each checked as after sign-in. */
  readonly services: readonly SetupService[];
  /** The project ID from the setup (step 1), if known, for the "Switch it on" link. */
  readonly projectId?: string;
  /** The record's refused refresh, if one is saved. While it is, nothing goes to Google. */
  readonly refreshRefused: SetupValues["refreshRefused"];
}

/** What Check again needs from the server. */
export interface CheckGoogleServicesAgainPorts {
  readonly http: HttpClient;
  readonly tokens: TokenStore;
  readonly clock: Clock;
  /** Reads a client secret by its ref: A1's client secret store. `null` when there is none. */
  readonly readClientSecret: (clientRef: string) => Promise<string | null>;
}

/** A refresh answer that didn't give an access token, for the account it was for. */
type FailedRefresh = Exclude<RefreshAnswerMeaning, { kind: "refreshed" }> & {
  readonly accountRef: string;
};

/**
 * How Check again ended. No kind holds a secret, and a refresh error carries
 * Google's error code at most, so every result is safe to show and to log.
 * A refused refresh comes back as B4 reads it (`signInRefused`,
 * `clientRefused`); the caller saves it on the record, as for a run.
 */
export type GoogleCheckAgainResult =
  | {
      readonly kind: "checked";
      readonly accountRef: string;
      /** One check result per ticked service, in the services' order. */
      readonly services: readonly ServiceResult[];
      readonly at: Date;
    }
  /** A refused refresh is saved on the record, so nothing was sent: no retry loop. */
  | { readonly kind: "refreshBlocked"; readonly accountRef: string }
  /** No refresh token is saved for the account: it has never signed in, or was disconnected. */
  | { readonly kind: "notSignedIn"; readonly accountRef: string }
  | { readonly kind: "noClientSecret"; readonly accountRef: string }
  | { readonly kind: "unreachable"; readonly accountRef: string }
  | FailedRefresh;

/**
 * Checks the services again for an account that has signed in (design 3.5,
 * item 7, "Check again"):
 * 1. refuses a bad ref or `googleCheck` URL before anything is read or sent;
 * 2. sends nothing while a refused refresh is saved on the record;
 * 3. refreshes the access token with the saved refresh token. A refusal
 *    comes back as is, and the saved token stays: whether to mark the
 *    account is the caller's call, from the record;
 * 4. if Google sent a new refresh token, saves it in place of the old one,
 *    as B4 says the host does after any refresh;
 * 5. compares the granted scopes and runs each service's check, exactly as
 *    after sign-in. The access token is then dropped: it never leaves this
 *    function.
 *
 * @param input - the account, client and services from the setup record
 * @param ports - the `HttpClient`, `TokenStore`, `Clock` and secret reader
 * @returns how it ended
 * @throws RangeError when the account ref, client ref or a `googleCheck` URL is refused
 */
export async function checkGoogleServicesAgain(
  input: CheckGoogleServicesAgainInput,
  ports: CheckGoogleServicesAgainPorts,
): Promise<GoogleCheckAgainResult> {
  const { accountRef } = input;
  // Both throw a RangeError for a bad ref, before anything is read or sent.
  const tokenName = refreshTokenName(accountRef);
  clientSecretName(input.clientRef);
  for (const service of input.services) {
    if (service.googleCheck !== undefined) {
      checkGoogleCheckUrl(service.googleCheck.url, service);
    }
  }
  if (!mayRefresh(input)) {
    return { kind: "refreshBlocked", accountRef };
  }

  const refreshToken = await ports.tokens.get(tokenName);
  if (refreshToken === null) {
    return { kind: "notSignedIn", accountRef };
  }
  const clientSecret = await ports.readClientSecret(input.clientRef);
  if (clientSecret === null) {
    return { kind: "noClientSecret", accountRef };
  }
  const answer = await postTokenForm(ports.http, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: input.clientId,
    client_secret: clientSecret,
  });
  if (answer === undefined) {
    return { kind: "unreachable", accountRef };
  }
  const meaning = readRefreshAnswer(answer);
  if (meaning.kind !== "refreshed") {
    return { ...meaning, accountRef };
  }
  // Saved before anything else is read from the answer: once Google has
  // issued a new refresh token, the old one may no longer work.
  if (meaning.refreshToken !== undefined) {
    await ports.tokens.set(tokenName, meaning.refreshToken);
  }
  // Google sends the granted scopes with every refresh. Without them we
  // couldn't tell which services are allowed, so the answer isn't one we know.
  if (meaning.grantedScopes === undefined) {
    return { kind: "unexpectedAnswer", status: answer.status, accountRef };
  }

  const at = ports.clock.now();
  const services = await checkServices(
    input.services,
    meaning.grantedScopes,
    meaning.accessToken,
    input.projectId,
    ports,
  );
  return { kind: "checked", accountRef, services, at };
}
