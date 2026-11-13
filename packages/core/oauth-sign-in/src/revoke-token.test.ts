import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeProvider, sentForm, sentHeaders } from "./fake-provider.test-helper.ts";
import { revokeToken } from "./revoke-token.ts";

// Fake values only; none is real.
const fakeRefreshToken = "fake-refresh-token-0000000001";
const fakeSecret = "fake-client-secret-0000000001";
const revokeUrl = "https://auth.example.com/oauth/revoke";

const revocation = {
  revokeUrl,
  token: fakeRefreshToken,
  client: { clientId: "fake-client", clientSecret: fakeSecret, clientAuth: "post" as const },
  signal: new AbortController().signal,
};

verifies("oauth-sign-in.revoke-token", () => {
  it("sends one POST of the token to the approved endpoint, in the body only, without following redirects", async () => {
    const http = fakeProvider(() => new Response(null, { status: 200 }));

    const result = await revokeToken(http, revocation);

    expect(result).toEqual({ kind: "revoked" });
    expect(http.received).toHaveLength(1);
    const [request] = http.received;
    expect(request?.url).toBe(revokeUrl);
    expect(request?.init.method).toBe("POST");
    expect(request?.init.redirect).toBe("error");
    expect(sentForm(request)).toEqual({
      token: fakeRefreshToken,
      token_type_hint: "refresh_token",
      client_id: "fake-client",
      client_secret: fakeSecret,
    });
    expect(request?.url).not.toContain(fakeRefreshToken);
  });

  it("authenticates with HTTP Basic when the client says so", async () => {
    const http = fakeProvider(() => new Response(null, { status: 200 }));

    await revokeToken(http, {
      ...revocation,
      client: { ...revocation.client, clientAuth: "basic" },
    });

    const [request] = http.received;
    expect(sentHeaders(request)["authorization"]).toMatch(/^Basic /);
    expect(sentForm(request)).not.toHaveProperty("client_secret");
  });

  it("says notConfirmed for any answer but 200, and when the server can't be reached", async () => {
    for (const answer of [
      () => new Response(null, { status: 503 }),
      () => Response.json({ error: "unsupported_token_type" }, { status: 400 }),
      () => {
        throw new Error(`connect failed for ${fakeRefreshToken}`);
      },
    ]) {
      const result = await revokeToken(fakeProvider(answer), revocation);

      expect(result).toEqual({ kind: "notConfirmed" });
    }
  });
});
