import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  fakeAccountRef,
  fakeCode,
  fakeIdToken,
  testStart,
  tokenSuccess,
} from "./fake-google.test-helper.ts";
import {
  driveScope,
  driveService,
  gmailCheckUrl,
  gmailScope,
  gmailService,
  signInOnce,
  startInput,
  testServer,
  tokenEndpoint,
} from "./sign-in.test-helper.ts";

const at = new Date(testStart);
const grantedBoth = `openid https://www.googleapis.com/auth/userinfo.email ${gmailScope} ${driveScope}`;

/** Google's answer to a check for a switched-off Gmail API, with free text that must not leak. */
function gmailOff(): Response {
  return Response.json(
    {
      error: {
        code: 403,
        message: "Gmail API is disabled. Holiday plans for alex@example.com",
        errors: [{ reason: "accessNotConfigured", message: "Holiday plans" }],
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "SERVICE_DISABLED",
            metadata: { service: "gmail.googleapis.com", consumer: "projects/123456789012" },
          },
        ],
      },
    },
    { status: 403 },
  );
}

verifies("google-sign-in.account-check", () => {
  it("returns wrongAccount for another address and saves, checks and revokes nothing", async () => {
    const { result, tokens, google } = await signInOnce(() =>
      tokenSuccess({ id_token: fakeIdToken({ email: "other@example.com" }) }),
    );

    expect(result).toEqual({
      kind: "wrongAccount",
      accountRef: fakeAccountRef,
      signedInAs: "other@example.com",
    });
    expect(tokens.namesWritten).toEqual([]);
    expect(google.requests.map((request) => request.url)).toEqual([tokenEndpoint]);
  });

  it("accepts the connector's address in another letter case", async () => {
    const { result } = await signInOnce(() =>
      tokenSuccess({ id_token: fakeIdToken({ email: "Account@Example.com" }) }),
    );

    expect(result).toMatchObject({ kind: "signedIn", email: "Account@Example.com" });
  });

  it("refuses the connector's own address when Google hasn't verified it, and saves nothing", async () => {
    for (const emailVerified of [false, "true", undefined]) {
      const { result, tokens } = await signInOnce(() =>
        tokenSuccess({ id_token: fakeIdToken({ email_verified: emailVerified }) }),
      );

      expect(result).toEqual({ kind: "idTokenRefused", accountRef: fakeAccountRef });
      expect(tokens.namesWritten).toEqual([]);
    }
  });
});

verifies("google-sign-in.service-checks", () => {
  it("checks each service in order and saves the refresh token first", async () => {
    const server = testServer((request) =>
      request.url === tokenEndpoint ? tokenSuccess({ scope: grantedBoth }) : gmailOff(),
    );
    const { state } = await server.start({
      ...startInput,
      services: [driveService, gmailService],
      projectId: "halonic-x1",
    });

    const result = await server.finish({ code: fakeCode, state });

    expect(result).toMatchObject({
      kind: "signedIn",
      services: [
        { service: "drive", result: { kind: "allowed" }, checkedAt: at },
        {
          service: "gmail",
          result: {
            kind: "apiOff",
            api: "gmail.googleapis.com",
            apiName: "Gmail API",
            project: "halonic-x1",
            enableUrl:
              "https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=halonic-x1",
          },
          checkedAt: at,
        },
      ],
    });
    expect(server.tokens.namesWritten).toEqual([`google-account-${fakeAccountRef}`]);
    expect(JSON.stringify(result)).not.toContain("Holiday");
  });

  it("doesn't check a service whose scopes the user unticked", async () => {
    const server = testServer(() => tokenSuccess({ scope: `openid ${driveScope}` }));
    const { state } = await server.start({ ...startInput, services: [gmailService] });

    const result = await server.finish({ code: fakeCode, state });

    expect(result).toMatchObject({
      services: [
        { service: "gmail", result: { kind: "scopeNotGranted", missingScopes: [gmailScope] } },
      ],
    });
    expect(server.google.requests.map((request) => request.url)).toEqual([tokenEndpoint]);
  });

  it("gives unreachable when a check gets no answer, and checkFailed for another status", async () => {
    const unreachable = await signInOnce((request) => {
      if (request.url === tokenEndpoint) {
        return tokenSuccess();
      }
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const failed = await signInOnce((request) =>
      request.url === tokenEndpoint
        ? tokenSuccess()
        : Response.json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, { status: 429 }),
    );

    expect(unreachable.result).toMatchObject({
      kind: "signedIn",
      services: [{ service: "gmail", result: { kind: "unreachable" } }],
    });
    expect(failed.result).toMatchObject({
      services: [
        {
          service: "gmail",
          result: { kind: "checkFailed", status: 429, reason: "rateLimitExceeded" },
        },
      ],
    });
    expect(unreachable.tokens.namesWritten).toEqual([`google-account-${fakeAccountRef}`]);
  });
});

verifies("google-sign-in.check-request", () => {
  it("sends a GET with only the bearer token, no body, no redirects and a time limit", async () => {
    const { google } = await signInOnce(() => tokenSuccess());
    const check = google.requests.find((request) => request.url === gmailCheckUrl);

    expect(check?.method).toBe("GET");
    expect(check?.hasBody).toBe(false);
    expect(check?.redirect).toBe("error");
    expect(check?.signal).toBeInstanceOf(AbortSignal);
    expect(check?.signal?.aborted).toBe(false);
    expect(check?.headers.get("authorization")).toBe("Bearer fake-access-token-0000000001");
    expect([...(check?.headers.keys() ?? [])].sort()).toEqual(["accept", "authorization"]);
  });

  it("refuses a check URL that isn't https on googleapis.com before anything goes to Google", async () => {
    const refused = [
      "https://googleapis.com.example.com/v1/me",
      "https://x@evil.example/",
      "https://user:pass@gmail.googleapis.com/v1/me",
      "http://gmail.googleapis.com/v1/me",
      "https://gmail.googleapis.com:8443/v1/me",
      "https://evilgoogleapis.com/v1/me",
      "not a url",
    ];
    for (const url of refused) {
      const server = testServer(() => tokenSuccess());
      const service = { ...gmailService, googleCheck: { method: "GET" as const, url } };

      await expect(server.start({ ...startInput, services: [service] })).rejects.toThrow(
        RangeError,
      );
      expect(server.ports.pendingSignIns.authUrlFor(fakeAccountRef)).toBeUndefined();
      expect(server.google.requests).toEqual([]);
    }
  });

  it("allows googleapis.com itself, a subdomain and the default port written out", async () => {
    const sentTo = {
      "https://googleapis.com/v1/me": "https://googleapis.com/v1/me",
      "https://gmail.googleapis.com/v1/me": "https://gmail.googleapis.com/v1/me",
      "https://gmail.googleapis.com:443/v1/me": "https://gmail.googleapis.com/v1/me",
    };
    for (const [url, expected] of Object.entries(sentTo)) {
      const server = testServer(() => tokenSuccess());
      const service = { ...gmailService, googleCheck: { method: "GET" as const, url } };
      const { state } = await server.start({ ...startInput, services: [service] });

      await server.finish({ code: fakeCode, state });

      expect(server.google.requests.map((request) => request.url)).toEqual([
        tokenEndpoint,
        expected,
      ]);
    }
  });
});
