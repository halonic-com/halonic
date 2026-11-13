import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exchangeAuthorizationCode } from "./exchange-code.ts";
import { formBody } from "./form-body.ts";
import { postTokenForm, tokenRequestTimeoutMs } from "./token-request.ts";

// Fake values only; none is real.
const fakeAccessToken = "fake-access-token-0000000001";
const fakeCode = "fake-authorisation-code-0000000001";
const fakeSecret = "fake-client-secret-0000000001";
/** A signal that never aborts. */
const signal = () => new AbortController().signal;
const tokenEndpoint = "https://auth.example.com/oauth/token";

const exchange = {
  tokenEndpoint,
  code: fakeCode,
  clientId: "fake-client.apps.example.com",
  clientSecret: fakeSecret,
  redirectUri: "http://127.0.0.1:8787/oauth/callback",
  codeVerifier: "fake-verifier-0000000000000000000000000000",
  signal: new AbortController().signal,
} as const;

/** One request the fake provider received. */
interface Received {
  readonly url: string;
  readonly init: RequestInit;
}

/** A fake `HttpClient` that records its requests and answers with `answer`, which may throw. */
function fakeProvider(answer: () => Response): HttpClient & { readonly received: Received[] } {
  const received: Received[] = [];
  return {
    received,
    async fetch(url: string, init: RequestInit = {}): Promise<Response> {
      received.push({ url, init });
      return answer();
    },
  };
}

verifies("oauth-sign-in.exchange-code", () => {
  it("sends one POST to the named endpoint with the code exchange's fields in the body only", async () => {
    const http = fakeProvider(() => Response.json({ access_token: fakeAccessToken }));

    const answer = await exchangeAuthorizationCode(http, exchange);

    expect(answer).toEqual({ status: 200, json: { access_token: fakeAccessToken } });
    expect(http.received).toHaveLength(1);
    const [request] = http.received;
    expect(request?.url).toBe(tokenEndpoint);
    expect(request?.init.method).toBe("POST");
    expect(request?.init.redirect).toBe("error");
    expect(Object.fromEntries(new URLSearchParams(String(request?.init.body)))).toEqual({
      grant_type: "authorization_code",
      code: fakeCode,
      client_id: exchange.clientId,
      client_secret: fakeSecret,
      redirect_uri: exchange.redirectUri,
      code_verifier: exchange.codeVerifier,
    });
    expect(request?.url).not.toContain(fakeCode);
    expect(request?.url).not.toContain(fakeSecret);
  });

  it("gives the status without a parsed body for an answer that isn't JSON", async () => {
    const http = fakeProvider(
      () => new Response(`<html>Error for ${fakeCode}</html>`, { status: 502 }),
    );

    expect(
      await postTokenForm(http, tokenEndpoint, { grant_type: "refresh_token" }, signal()),
    ).toEqual({
      status: 502,
      json: undefined,
    });
  });

  it("gives nothing when the provider can't be reached, and never passes on the client's error", async () => {
    const http = fakeProvider(() => {
      throw new Error(`connect failed for ${fakeSecret}`);
    });

    const answer = await exchangeAuthorizationCode(http, exchange);

    expect(answer).toBeUndefined();
  });

  it("passes the caller's signal on, so the caller can stop a stalled request", async () => {
    const http = fakeProvider(() => Response.json({}));
    const stop = new AbortController();

    await postTokenForm(http, tokenEndpoint, {}, stop.signal);

    expect(tokenRequestTimeoutMs).toBe(10_000);
    expect(http.received[0]?.init.signal).toBe(stop.signal);
  });
});

verifies("oauth-sign-in.form-body", () => {
  it("writes the fields in order, as URLSearchParams writes them", () => {
    const fields = {
      grant_type: "authorization_code",
      redirect_uri: "http://127.0.0.1:8787/oauth/callback",
      scope: "a b+c",
      odd: `!'()*~-._ &=%/?#é😀`,
    };

    expect(formBody(fields)).toBe(new URLSearchParams(fields).toString());
    expect(formBody({})).toBe("");
  });

  it("writes names the same way as values", () => {
    expect(formBody({ "a b&c": "1" })).toBe(new URLSearchParams({ "a b&c": "1" }).toString());
  });
});
