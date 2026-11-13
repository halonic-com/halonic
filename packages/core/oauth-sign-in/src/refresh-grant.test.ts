import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeProvider, sentForm, sentHeaders } from "./fake-provider.test-helper.ts";
import { refreshAccessToken } from "./refresh-grant.ts";

// Fake values only; none is real.
const fakeAccessToken = "fake-access-token-0000000001";
const fakeRefreshToken = "fake-refresh-token-0000000001";
const fakeSecret = "fake-client-secret-0000000001";
const tokenEndpoint = "https://auth.example.com/oauth/token";

const grant = {
  tokenEndpoint,
  refreshToken: fakeRefreshToken,
  client: { clientId: "fake-client", clientSecret: fakeSecret, clientAuth: "post" as const },
  signal: new AbortController().signal,
};

const answerWithToken = () =>
  Response.json({ access_token: fakeAccessToken, token_type: "Bearer", expires_in: 60 });

verifies("oauth-sign-in.refresh-grant", () => {
  it("sends one POST of the refresh grant to the approved endpoint, secrets in the body only", async () => {
    const http = fakeProvider(answerWithToken);

    const result = await refreshAccessToken(http, grant);

    expect(result).toEqual({ kind: "refreshed", accessToken: fakeAccessToken, expiresIn: 60 });
    expect(http.received).toHaveLength(1);
    const [request] = http.received;
    expect(request?.url).toBe(tokenEndpoint);
    expect(request?.init.method).toBe("POST");
    expect(request?.init.redirect).toBe("error");
    expect(request?.init.signal).toBe(grant.signal);
    expect(sentForm(request)).toEqual({
      grant_type: "refresh_token",
      refresh_token: fakeRefreshToken,
      client_id: "fake-client",
      client_secret: fakeSecret,
    });
    expect(request?.url).not.toContain(fakeRefreshToken);
  });

  it("authenticates with HTTP Basic when the client says so, and then sends no secret in the body", async () => {
    const http = fakeProvider(answerWithToken);

    await refreshAccessToken(http, { ...grant, client: { ...grant.client, clientAuth: "basic" } });

    const [request] = http.received;
    expect(sentHeaders(request)["authorization"]).toMatch(/^Basic /);
    expect(sentForm(request)).toEqual({
      grant_type: "refresh_token",
      refresh_token: fakeRefreshToken,
    });
  });

  it("gives what the answer means, including a refused grant", async () => {
    const http = fakeProvider(() => Response.json({ error: "invalid_grant" }, { status: 400 }));

    expect(await refreshAccessToken(http, grant)).toEqual({ kind: "grantRefused" });
  });

  it("gives unreachable, carrying nothing, when the provider can't be reached", async () => {
    const http = fakeProvider(() => {
      throw new Error(`connect failed for ${fakeRefreshToken}`);
    });

    const result = await refreshAccessToken(http, grant);

    expect(result).toEqual({ kind: "unreachable" });
  });
});
