import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  fakeAccessToken,
  fakeClient,
  fakeCode,
  fakeIdToken,
  fakeRefreshToken,
  hostileError,
  htmlErrorPage,
  tokenSuccess,
} from "./fake-google.test-helper.ts";
import { findLeakedSecrets } from "./leak-scan.test-helper.ts";
import { revokeGoogleSignIn } from "./revoke.ts";
import { knownVerifier, signInOnce } from "./sign-in.test-helper.ts";

/** Every secret of a sign-in. The whole ID token counts, because it holds the e-mail. */
const secrets = {
  clientSecret: fakeClient.clientSecret,
  code: fakeCode,
  verifier: knownVerifier,
  accessToken: fakeAccessToken,
  refreshToken: fakeRefreshToken,
  idToken: fakeIdToken(),
};

/** Google's answers, friendly and hostile, each of which the round trip must survive without a leak. */
const answers: Record<string, () => Response> = {
  success: () => tokenSuccess(),
  wrongClientSecret: () => hostileError("invalid_client", 401),
  codeRefused: () => hostileError("invalid_grant"),
  otherError: () => hostileError("server_error", 500),
  errorCodeThatEchoes: () => hostileError(fakeCode),
  htmlPage: htmlErrorPage,
  noRefreshToken: () => tokenSuccess({ refresh_token: undefined }),
  idTokenRefused: () => tokenSuccess({ id_token: fakeIdToken({ email_verified: false }) }),
  networkFailure: () => {
    throw new Error(`reset while sending ${fakeClient.clientSecret}`, { cause: fakeCode });
  },
};

verifies("google-sign-in.no-secret-leak", () => {
  for (const [name, answer] of Object.entries(answers)) {
    it(`keeps every secret out of the result, auth URL, request URLs and store names: ${name}`, async () => {
      const { result, authUrl, google, tokens } = await signInOnce(answer);

      const leaked = findLeakedSecrets(secrets, {
        results: [result],
        texts: [authUrl, ...google.requests.map((request) => request.url), ...tokens.namesWritten],
      });

      expect(leaked).toEqual([]);
    });
  }

  it("never writes the pending sign-in to the TokenStore", async () => {
    const { tokens } = await signInOnce(() => tokenSuccess());

    expect(tokens.namesWritten).toEqual(["google-account-gaccount_fake1"]);
    expect([...tokens.values.values()]).toEqual([fakeRefreshToken]);
  });

  it("keeps the refresh token out of the revoke URL and result", async () => {
    const { google, tokens } = await signInOnce(() => tokenSuccess());
    const result = await revokeGoogleSignIn("gaccount_fake1", { http: google, tokens });

    const leaked = findLeakedSecrets(secrets, {
      results: [result],
      texts: google.requests.map((request) => request.url),
    });

    expect(leaked).toEqual([]);
  });

  it("finds a secret in a result, its JSON, an error's cause or a text", () => {
    const secret = { code: fakeCode };

    expect(findLeakedSecrets(secret, { results: [{ value: fakeCode }] })).toEqual(["code"]);
    expect(
      findLeakedSecrets(secret, { errors: [new Error("x", { cause: new Error(fakeCode) })] }),
    ).toEqual(["code"]);
    expect(findLeakedSecrets(secret, { errors: [fakeCode] })).toEqual(["code"]);
    expect(findLeakedSecrets(secret, { texts: [`/callback?code=${fakeCode}`] })).toEqual(["code"]);
    expect(findLeakedSecrets(secret, { results: [{ kind: "cancelled" }] })).toEqual([]);
  });
});
