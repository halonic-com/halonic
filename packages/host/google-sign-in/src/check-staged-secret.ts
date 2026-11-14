import {
  clientSecretName,
  type RefreshAnswerMeaning,
  readRefreshAnswer,
  refreshTokenName,
} from "@halonicjs/google-setup";
import type { HttpClient, TokenStore } from "@halonicjs/ports";
import { postTokenForm } from "./token-request.ts";

/** What the staged-secret check needs from the server. */
export interface CheckStagedClientSecretPorts {
  readonly http: HttpClient;
  readonly tokens: TokenStore;
  /** Reads the staged client secret by its ref: A1's `readStagedClientSecret`. `null` when none is staged. */
  readonly readStagedClientSecret: (clientRef: string) => Promise<string | null>;
}

/**
 * How the check of a staged secret ended. No kind holds a secret, and an
 * error carries Google's error code at most, so every result is safe to
 * return from a route.
 */
export type StagedSecretCheckResult =
  /** Google refreshed the token with the staged secret: it can be promoted. */
  | { readonly kind: "accepted" }
  /** Google refused the staged secret (`invalid_client`): it can be discarded. */
  | { readonly kind: "refused" }
  /** No secret is staged for the client. Nothing was sent. */
  | { readonly kind: "nothingStaged" }
  /** The account has no saved refresh token to test with. Nothing was sent. */
  | { readonly kind: "notSignedIn" }
  /** Google couldn't be reached. The staged secret says nothing yet. */
  | { readonly kind: "unreachable" }
  /**
   * Google refused the refresh token itself, or answered something else, so
   * the staged secret was not tested. The saved refresh token stays.
   */
  | Exclude<RefreshAnswerMeaning, { kind: "refreshed" | "clientRefused" }>;

/**
 * Tests a staged client secret (design 4.3): one refresh with the account's
 * saved refresh token and the staged secret in the form body, redirects
 * refused. The secret in use isn't read and nothing is checked at the
 * services: the refresh is the whole test.
 *
 * This is the one refresh allowed while a `client` refusal is saved (see
 * `mayRefresh`), because it tests a new secret, not the refused one. If Google
 * sends a new refresh token it replaces the saved one, as after any refresh.
 * The caller promotes or discards the staged secret from the result.
 *
 * @param input - the account ref, the client ID and the client ref, none of them secret
 * @param ports - the `HttpClient`, `TokenStore` and the staged-secret reader
 * @returns how the check ended
 * @throws RangeError when the account ref or client ref is refused, before anything is read or sent
 */
export async function checkStagedClientSecret(
  input: { readonly accountRef: string; readonly clientId: string; readonly clientRef: string },
  ports: CheckStagedClientSecretPorts,
): Promise<StagedSecretCheckResult> {
  const tokenName = refreshTokenName(input.accountRef);
  clientSecretName(input.clientRef);
  const stagedSecret = await ports.readStagedClientSecret(input.clientRef);
  if (stagedSecret === null) {
    return { kind: "nothingStaged" };
  }
  const refreshToken = await ports.tokens.get(tokenName);
  if (refreshToken === null) {
    return { kind: "notSignedIn" };
  }
  const answer = await postTokenForm(ports.http, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: input.clientId,
    client_secret: stagedSecret,
  });
  if (answer === undefined) {
    return { kind: "unreachable" };
  }
  const meaning = readRefreshAnswer(answer);
  if (meaning.kind === "clientRefused") {
    return { kind: "refused" };
  }
  if (meaning.kind !== "refreshed") {
    return meaning;
  }
  if (meaning.refreshToken !== undefined) {
    await ports.tokens.set(tokenName, meaning.refreshToken);
  }
  return { kind: "accepted" };
}
