import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type CheckGoogleServicesAgainInput,
  checkGoogleServicesAgain,
  type GoogleCheckAgainResult,
} from "./check-again.ts";
import {
  fakeAccessToken,
  fakeAccountRef,
  fakeClient,
  fakeGoogle,
  fakeRefreshToken,
  fakeTokenStore,
  hostileError,
  htmlErrorPage,
  type RecordedRequest,
  testStart,
} from "./fake-google.test-helper.ts";
import { findLeakedSecrets } from "./leak-scan.test-helper.ts";
import {
  driveScope,
  driveService,
  gmailCheckUrl,
  gmailScope,
  gmailService,
  tokenEndpoint,
} from "./sign-in.test-helper.ts";

const refreshName = `google-account-${fakeAccountRef}`;
const rotatedRefreshToken = "fake-refresh-token-0000000002";

const input: CheckGoogleServicesAgainInput = {
  accountRef: fakeAccountRef,
  clientId: fakeClient.clientId,
  clientRef: fakeClient.clientRef,
  services: [gmailService],
  refreshRefused: null,
};

/** Google's answer to a good refresh, with `overrides` applied. */
function refreshSuccess(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    access_token: fakeAccessToken,
    expires_in: 3599,
    scope: `openid ${gmailScope} ${driveScope}`,
    token_type: "Bearer",
    ...overrides,
  });
}

/** Google answering the refresh with `refresh` and every check with `check`. */
function google(refresh: () => Response, check: () => Response = () => Response.json({})) {
  return (request: RecordedRequest) => (request.url === tokenEndpoint ? refresh() : check());
}

/** Runs Check again against a fake Google, with a refresh token saved unless `saved` is `null`. */
async function checkAgain(
  answer: (request: RecordedRequest) => Response,
  options: { input?: CheckGoogleServicesAgainInput; saved?: string | null } = {},
) {
  const http = fakeGoogle(answer);
  const tokens = fakeTokenStore();
  const saved = options.saved === undefined ? fakeRefreshToken : options.saved;
  if (saved !== null) {
    tokens.values.set(refreshName, saved);
  }
  const ports = {
    http,
    tokens,
    clock: { now: () => new Date(testStart) },
    readClientSecret: async (clientRef: string) =>
      clientRef === fakeClient.clientRef ? fakeClient.clientSecret : null,
  };
  const result = await checkGoogleServicesAgain(options.input ?? input, ports);
  return { result, http, tokens };
}

verifies("google-sign-in.check-again", () => {
  it("refreshes with the saved token and checks each service as after sign-in", async () => {
    const off = () =>
      Response.json(
        { error: { code: 403, errors: [{ reason: "accessNotConfigured" }] } },
        { status: 403 },
      );
    const { result, http, tokens } = await checkAgain(google(refreshSuccess, off), {
      input: { ...input, services: [driveService, gmailService] },
    });

    expect(result).toEqual({
      kind: "checked",
      accountRef: fakeAccountRef,
      services: [
        { service: "drive", result: { kind: "allowed" }, checkedAt: new Date(testStart) },
        { service: "gmail", result: { kind: "apiOff" }, checkedAt: new Date(testStart) },
      ],
      at: new Date(testStart),
    });
    expect(http.requests.map((request) => request.url)).toEqual([tokenEndpoint, gmailCheckUrl]);
    const [refresh, check] = http.requests;
    expect(refresh?.method).toBe("POST");
    expect(refresh?.redirect).toBe("error");
    expect(Object.fromEntries(refresh?.form ?? [])).toEqual({
      grant_type: "refresh_token",
      refresh_token: fakeRefreshToken,
      client_id: fakeClient.clientId,
      client_secret: fakeClient.clientSecret,
    });
    expect(check?.headers.get("authorization")).toBe(`Bearer ${fakeAccessToken}`);
    expect(tokens.namesWritten).toEqual([]);
  });

  it("uses the scopes of the refresh, which can be fewer than at sign-in", async () => {
    const { result, http } = await checkAgain(
      google(() => refreshSuccess({ scope: `openid ${driveScope}` })),
    );

    expect(result).toMatchObject({
      services: [
        { service: "gmail", result: { kind: "scopeNotGranted", missingScopes: [gmailScope] } },
      ],
    });
    expect(http.requests.map((request) => request.url)).toEqual([tokenEndpoint]);
  });

  it("saves a new refresh token when Google sends one", async () => {
    const { result, tokens } = await checkAgain(
      google(() => refreshSuccess({ refresh_token: rotatedRefreshToken })),
    );

    expect(result).toMatchObject({ kind: "checked" });
    expect([...tokens.values]).toEqual([[refreshName, rotatedRefreshToken]]);
  });

  it("saves a new refresh token even when the refresh has no granted scopes", async () => {
    const { result, http, tokens } = await checkAgain(
      google(() => refreshSuccess({ scope: undefined, refresh_token: rotatedRefreshToken })),
    );

    expect(result).toEqual({ kind: "unexpectedAnswer", status: 200, accountRef: fakeAccountRef });
    expect(http.requests.map((request) => request.url)).toEqual([tokenEndpoint]);
    expect([...tokens.values]).toEqual([[refreshName, rotatedRefreshToken]]);
  });

  it("sends nothing while a refused refresh is saved on the record", async () => {
    const refreshRefused = { reason: "sign-in", at: "2026-11-08T11:00:00.000Z" } as const;
    const { result, http } = await checkAgain(google(refreshSuccess), {
      input: { ...input, refreshRefused },
    });

    expect(result).toEqual({ kind: "refreshBlocked", accountRef: fakeAccountRef });
    expect(http.requests).toEqual([]);
  });

  it("refuses a bad check URL or ref before reading or sending anything", async () => {
    const badCheck = {
      ...gmailService,
      googleCheck: { method: "GET" as const, url: "https://storage.googleapis.com/some-bucket/me" },
    };
    // A host the service lists is still refused when it isn't Google's.
    const listedNonGoogleHost = {
      ...gmailService,
      googleApis: [{ api: "evil.example", name: "Not Google" }],
      googleCheck: { method: "GET" as const, url: "https://evil.example/me" },
    };
    for (const bad of [
      { ...input, services: [badCheck] },
      { ...input, services: [listedNonGoogleHost] },
      { ...input, accountRef: "not a ref" },
      { ...input, clientRef: "not a ref" },
    ]) {
      const http = fakeGoogle(google(refreshSuccess));
      const tokens = fakeTokenStore();
      const reads: string[] = [];
      const ports = {
        http,
        tokens: {
          ...tokens,
          get: async (name: string) => {
            reads.push(name);
            return tokens.get(name);
          },
        },
        clock: { now: () => new Date(testStart) },
        readClientSecret: async (clientRef: string) => {
          reads.push(clientRef);
          return fakeClient.clientSecret;
        },
      };

      await expect(checkGoogleServicesAgain(bad, ports)).rejects.toThrow(RangeError);
      expect(http.requests).toEqual([]);
      expect(reads).toEqual([]);
    }
  });

  describe("without a refreshed token", () => {
    const cases: Record<string, [() => Response, Partial<GoogleCheckAgainResult>]> = {
      invalid_grant: [() => hostileError("invalid_grant"), { kind: "signInRefused" }],
      invalid_client: [() => hostileError("invalid_client", 401), { kind: "clientRefused" }],
      "another error": [
        () => hostileError("server_error", 500),
        { kind: "googleError", errorCode: "server_error", status: 500 },
      ],
      "an HTML page": [htmlErrorPage, { kind: "unexpectedAnswer", status: 502 }],
      "no granted scopes": [
        () => refreshSuccess({ scope: undefined }),
        { kind: "unexpectedAnswer", status: 200 },
      ],
    };
    for (const [name, [answer, expected]] of Object.entries(cases)) {
      it(`returns the refresh answer for ${name}, checks nothing and keeps the saved token`, async () => {
        const { result, http, tokens } = await checkAgain(google(answer));

        expect(result).toEqual({ ...expected, accountRef: fakeAccountRef });
        expect(http.requests.map((request) => request.url)).toEqual([tokenEndpoint]);
        expect([...tokens.values]).toEqual([[refreshName, fakeRefreshToken]]);
        expect(tokens.namesWritten).toEqual([]);
      });
    }

    it("returns notSignedIn, noClientSecret or unreachable before Google can answer", async () => {
      const notSignedIn = await checkAgain(google(refreshSuccess), { saved: null });
      const noClientSecret = await checkAgain(google(refreshSuccess), {
        input: { ...input, clientRef: "gclient_other1" },
      });
      const unreachable = await checkAgain(() => {
        throw new TypeError("fetch failed");
      });

      expect(notSignedIn.result).toEqual({ kind: "notSignedIn", accountRef: fakeAccountRef });
      expect(notSignedIn.http.requests).toEqual([]);
      expect(noClientSecret.result).toEqual({ kind: "noClientSecret", accountRef: fakeAccountRef });
      expect(noClientSecret.http.requests).toEqual([]);
      expect(unreachable.result).toEqual({ kind: "unreachable", accountRef: fakeAccountRef });
    });
  });

  it("keeps every secret out of its results and request URLs, whatever Google answers", async () => {
    const secrets = {
      clientSecret: fakeClient.clientSecret,
      refreshToken: fakeRefreshToken,
      rotatedRefreshToken,
      accessToken: fakeAccessToken,
    };
    const echo = Object.values(secrets).join(" ");
    const echoingCheck = () =>
      Response.json({ error: { message: echo, errors: [{ reason: echo }] } }, { status: 401 });
    const answers: ((request: RecordedRequest) => Response)[] = [
      google(() => refreshSuccess({ refresh_token: rotatedRefreshToken }), echoingCheck),
      google(() => Response.json({ error: echo, error_description: echo }, { status: 400 })),
      google(() => hostileError(fakeRefreshToken)),
      () => {
        throw new Error(`reset while sending ${echo}`, { cause: echo });
      },
    ];

    for (const answer of answers) {
      const { result, http, tokens } = await checkAgain(answer);

      expect(
        findLeakedSecrets(secrets, {
          results: [result],
          texts: [...http.requests.map((request) => request.url), ...tokens.namesWritten],
        }),
      ).toEqual([]);
    }
  });
});
