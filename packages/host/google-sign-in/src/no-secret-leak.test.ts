import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
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
import { knownVerifier, signInOnce, tokenEndpoint } from "./sign-in.test-helper.ts";

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

/** A check answer that echoes every secret, as a hostile or broken API could. */
function echoingCheckAnswer(status: number): Response {
  const echo = Object.values(secrets).join(" ");
  return Response.json(
    { error: { message: echo, errors: [{ reason: echo, message: echo }] } },
    { status },
  );
}

/**
 * A check answer that says the API is off and puts one secret, on its own,
 * into each field the reader looks at: the reason, the API host and the
 * project. Each has the shape the field expects, so only the reader's rules
 * keep it out, not the token's format.
 */
function echoingApiOffAnswer(secret: string): Response {
  return Response.json(
    {
      error: {
        errors: [{ reason: "accessNotConfigured" }, { reason: secret }],
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "SERVICE_DISABLED",
            metadata: { service: `${secret}.googleapis.com`, consumer: `projects/${secret}` },
          },
        ],
      },
    },
    { status: 403 },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

  for (const status of [200, 403, 500]) {
    it(`keeps every secret out of the result when a check's answer echoes them: ${status}`, async () => {
      const { result } = await signInOnce((request) =>
        request.url === tokenEndpoint ? tokenSuccess() : echoingCheckAnswer(status),
      );

      expect(findLeakedSecrets(secrets, { results: [result] })).toEqual([]);
    });
  }

  for (const [name, secret] of Object.entries(secrets)) {
    it(`keeps a secret out of an apiOff result that echoes it as the API and project: ${name}`, async () => {
      const { result } = await signInOnce((request) =>
        request.url === tokenEndpoint ? tokenSuccess() : echoingApiOffAnswer(secret),
      );

      expect(result).toMatchObject({
        kind: "signedIn",
        services: expect.arrayContaining([
          expect.objectContaining({ result: expect.objectContaining({ kind: "apiOff" }) }),
        ]),
      });
      expect(findLeakedSecrets(secrets, { results: [result] })).toEqual([]);
    });
  }

  it("sends the access token only in a check's Authorization header", async () => {
    const { google } = await signInOnce(() => tokenSuccess());

    for (const request of google.requests) {
      const isCheck = request.url !== tokenEndpoint;
      const headerTexts = [...request.headers.values()];
      expect(headerTexts.some((value) => value.includes(fakeAccessToken))).toBe(isCheck);
      expect(request.form.toString()).not.toContain(fakeAccessToken);
      if (isCheck) {
        expect(new URL(request.url).hostname.endsWith(".googleapis.com")).toBe(true);
      }
    }
  });

  it("writes nothing to the console during a sign-in with checks", async () => {
    const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
    const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));

    await signInOnce((request) =>
      request.url === tokenEndpoint ? tokenSuccess() : echoingCheckAnswer(403),
    );

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

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
