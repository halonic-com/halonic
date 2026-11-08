import type { HttpClient, TokenStore } from "@halonicjs/ports";
import { encodeBase64url, encodeUtf8 } from "@halonicjs/std";

/** Fake values for one sign-in. None is real. */
export const fakeClient = {
  clientId: "fake-client.apps.example.com",
  clientRef: "gclient_fake1",
  clientSecret: "fake-client-secret-0000000001",
} as const;

export const fakeAccountRef = "gaccount_fake1";
export const fakeCode = "fake-authorisation-code-0000000001";
export const fakeAccessToken = "fake-access-token-0000000001";
export const fakeRefreshToken = "fake-refresh-token-0000000001";
export const fakeEmail = "account@example.com";

/** 2026-11-08T12:00:00Z, the time the tests' clocks start at. */
export const testStart = Date.UTC(2026, 10, 8, 12, 0, 0);

/**
 * A fake ID token: an unsigned JWT whose payload holds `claims`, by default
 * the claims Google sends for our client, valid for an hour from `testStart`.
 */
export function fakeIdToken(claims: Record<string, unknown> = {}): string {
  const part = (value: unknown) => encodeBase64url(encodeUtf8(JSON.stringify(value)));
  const payload = {
    iss: "https://accounts.google.com",
    aud: fakeClient.clientId,
    sub: "100000000000000000001",
    email: fakeEmail,
    email_verified: true,
    exp: testStart / 1000 + 3600,
    ...claims,
  };
  return `${part({ alg: "RS256", typ: "JWT" })}.${part(payload)}.fake-signature`;
}

/** Google's answer to a good code exchange, with `overrides` applied. */
export function tokenSuccess(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    access_token: fakeAccessToken,
    refresh_token: fakeRefreshToken,
    id_token: fakeIdToken(),
    scope:
      "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.readonly",
    token_type: "Bearer",
    expires_in: 3599,
    ...overrides,
  });
}

/** A hostile error answer: its `error_description` echoes the code and the client secret. */
export function hostileError(error: string, status = 400): Response {
  return Response.json(
    { error, error_description: `Bad request for ${fakeCode} with ${fakeClient.clientSecret}` },
    { status },
  );
}

/** An HTML error page that also echoes the code. */
export function htmlErrorPage(): Response {
  return new Response(`<html><body>Error 502 for ${fakeCode}</body></html>`, { status: 502 });
}

/** One request the fake Google received. */
export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly form: URLSearchParams;
}

/**
 * A fake `HttpClient` standing in for Google. It records every request and
 * answers with `answer`, which may throw to act as a network failure.
 */
export function fakeGoogle(
  answer: (request: RecordedRequest) => Response,
): HttpClient & { readonly requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  return {
    requests,
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      const request = {
        url,
        method: init?.method ?? "GET",
        form: new URLSearchParams(typeof init?.body === "string" ? init.body : ""),
      };
      requests.push(request);
      return answer(request);
    },
  };
}

/** An in-memory `TokenStore` that records the names written. */
export function fakeTokenStore(): TokenStore & {
  readonly values: Map<string, string>;
  readonly namesWritten: string[];
} {
  const values = new Map<string, string>();
  const namesWritten: string[] = [];
  return {
    values,
    namesWritten,
    get: async (name) => values.get(name) ?? null,
    set: async (name, value) => {
      namesWritten.push(name);
      values.set(name, value);
    },
    remove: async (name) => {
      values.delete(name);
    },
  };
}
