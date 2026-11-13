import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exampleFlow, flowPort } from "./fake-flow.test-helper.ts";
import {
  fakeAccessToken,
  fakeClientSecret,
  rotatedRefreshToken,
  signInName,
} from "./fake-integration.test-helper.ts";

const shortToken = "short";
const newRefreshToken = "fake-refresh-token-of-the-second-sign-in";

/** Starts a sign-in and answers its callback with the code. */
async function signInWith(test: ReturnType<typeof exampleFlow>, code: string): Promise<void> {
  const started = await test.started();
  await test.flow.handleCallback(started.callback({ state: started.state, code }));
}

verifies("integration-sign-in.sign-in-flow", () => {
  it("builds the authorize URL itself, with a redirect to a random path on 127.0.0.1", async () => {
    const test = exampleFlow();

    const started = await test.started();

    const query = started.authorizeUrl.searchParams;
    expect(started.authorizeUrl.origin + started.authorizeUrl.pathname).toBe(
      "https://auth.example.com/oauth/authorize",
    );
    expect(query.get("response_type")).toBe("code");
    expect(query.get("client_id")).toBe("fake-client");
    expect(query.get("scope")).toBe("projects.read");
    expect(query.get("code_challenge_method")).toBe("S256");
    expect(query.get("redirect_uri")).toBe(`http://127.0.0.1:${flowPort}${started.callbackPath}`);
    expect(started.callbackPath).toMatch(/^\/sign-in\/[A-Za-z0-9_-]{43}$/);
  });

  it("uses a new random path for each start", async () => {
    const test = exampleFlow();

    const first = await test.started();
    const second = await test.started();

    expect(second.callbackPath).not.toBe(first.callbackPath);
  });

  it("exchanges the code once at the approved token URL and saves the refresh token", async () => {
    const test = exampleFlow();
    const started = await test.started();

    const response = await test.flow.handleCallback(
      started.callback({ state: started.state, code: "fake-code-1" }),
    );

    expect(response.status).toBe(200);
    expect(test.outcomes).toEqual([
      { kind: "signedIn", signIn: signInName, missingScopes: [], extraScopes: [] },
    ]);
    expect(test.seen).toHaveLength(1);
    expect(test.seen[0]?.url).toBe("https://auth.example.com/oauth/token");
    expect(test.seen[0]?.body).toContain("code=fake-code-1");
    expect(test.seen[0]?.body).toContain("code_verifier=");
    expect(test.seen[0]?.body).toContain(`client_secret=${fakeClientSecret}`);
    const grant = await test.grants.find("example", signInName);
    expect(grant?.refreshToken).toBe(rotatedRefreshToken);
  });

  it("refuses a second callback with the same state and exchanges nothing", async () => {
    const test = exampleFlow();
    const started = await test.started();
    const callback = { state: started.state, code: "fake-code-1" };
    await test.flow.handleCallback(started.callback(callback));

    const again = await test.flow.handleCallback(started.callback(callback));

    expect(again.status).toBe(400);
    expect(test.seen).toHaveLength(1);
  });

  it("answers a path that isn't pending with a plain 400 and does nothing", async () => {
    const test = exampleFlow();
    await test.started();

    const response = await test.flow.handleCallback(
      new Request(`http://127.0.0.1:${flowPort}/sign-in/unknown?state=x&code=y`),
    );

    expect(response.status).toBe(400);
    expect(test.outcomes).toEqual([]);
    expect(test.seen).toEqual([]);
  });

  it("refuses a wrong state, and then the real callback finds nothing either", async () => {
    const test = exampleFlow();
    const started = await test.started();

    const forged = await test.flow.handleCallback(
      started.callback({ state: "forged-state", code: "fake-code-1" }),
    );
    const real = await test.flow.handleCallback(
      started.callback({ state: started.state, code: "fake-code-1" }),
    );

    expect(forged.status).toBe(400);
    expect(real.status).toBe(400);
    expect(test.seen).toEqual([]);
  });

  it("lets a new start replace the one before it", async () => {
    const test = exampleFlow();
    const first = await test.started();
    await test.started();

    const response = await test.flow.handleCallback(
      first.callback({ state: first.state, code: "fake-code-1" }),
    );

    expect(response.status).toBe(400);
    expect(test.seen).toEqual([]);
  });

  it("refuses a callback after 10 minutes", async () => {
    const test = exampleFlow();
    const started = await test.started();

    test.wait(10 * 60 * 1000);
    const response = await test.flow.handleCallback(
      started.callback({ state: started.state, code: "fake-code-1" }),
    );

    expect(response.status).toBe(400);
    expect(test.seen).toEqual([]);
  });

  it("refuses an `iss` that isn't the authorize URL's origin when no issuer is declared", async () => {
    const test = exampleFlow();
    const started = await test.started();

    await test.flow.handleCallback(
      started.callback({ state: started.state, code: "c", iss: "https://evil.example.com" }),
    );

    expect(test.outcomes).toEqual([{ kind: "issuerMismatch", signIn: signInName }]);
    expect(test.seen).toEqual([]);
  });

  it("accepts an `iss` that is the authorize URL's origin", async () => {
    const test = exampleFlow();
    const started = await test.started();

    await test.flow.handleCallback(
      started.callback({ state: started.state, code: "c", iss: "https://auth.example.com" }),
    );

    expect(test.outcomes[0]?.kind).toBe("signedIn");
  });

  it("requires the declared issuer in the callback", async () => {
    const test = exampleFlow({ issuer: "https://issuer.example.com" });
    const without = await test.started();
    await test.flow.handleCallback(without.callback({ state: without.state, code: "c" }));
    const wrong = await test.started();
    await test.flow.handleCallback(
      wrong.callback({ state: wrong.state, code: "c", iss: "https://auth.example.com" }),
    );
    const right = await test.started();
    await test.flow.handleCallback(
      right.callback({ state: right.state, code: "c", iss: "https://issuer.example.com" }),
    );

    expect(test.outcomes.map((outcome) => outcome.kind)).toEqual([
      "issuerMismatch",
      "issuerMismatch",
      "signedIn",
    ]);
  });

  it("refuses to exchange when a setting changed after the start", async () => {
    const test = exampleFlow();
    const started = await test.started();

    test.changeSettings({ clientId: "another-fake-client" });
    await test.flow.handleCallback(started.callback({ state: started.state, code: "c" }));

    expect(test.outcomes).toEqual([{ kind: "signInChanged", signIn: signInName }]);
    expect(test.seen).toEqual([]);
    expect(await test.grants.find("example", signInName)).toBeUndefined();
  });

  it("revokes the old grant at its approved URL and drops it before saving the new one", async () => {
    const test = exampleFlow();
    await signInWith(test, "fake-code-1");
    test.changeSettings({ clientId: "another-fake-client" });
    test.answerWith({
      status: 200,
      body: { access_token: fakeAccessToken, token_type: "Bearer", refresh_token: newRefreshToken },
    });
    test.seen.length = 0;

    await signInWith(test, "fake-code-2");

    const [exchange, revoke] = test.seen;
    expect(revoke?.url).toBe("https://auth.example.com/oauth/revoke");
    expect(revoke?.body).toContain(`token=${rotatedRefreshToken}`);
    expect(revoke?.body).toContain("client_id=fake-client");
    expect(exchange?.url).toBe("https://auth.example.com/oauth/token");
    expect(test.seen).toHaveLength(2);
    expect(test.outcomes.at(-1)).toEqual({
      kind: "signedIn",
      signIn: signInName,
      missingScopes: [],
      extraScopes: [],
      previousGrant: "revoked",
    });
    const grant = await test.grants.find("example", signInName);
    expect(grant?.refreshToken).toBe(newRefreshToken);
    expect(grant?.approved.clientId).toBe("another-fake-client");
  });

  it("drops the old grant and says so when the provider doesn't confirm the revoke", async () => {
    const test = exampleFlow();
    await signInWith(test, "fake-code-1");
    test.answerRevokeWith(500);
    test.answerWith({
      status: 200,
      body: { access_token: fakeAccessToken, token_type: "Bearer", refresh_token: newRefreshToken },
    });

    await signInWith(test, "fake-code-2");

    expect(test.outcomes.at(-1)).toMatchObject({ kind: "signedIn", previousGrant: "notConfirmed" });
    expect((await test.grants.find("example", signInName))?.refreshToken).toBe(newRefreshToken);
  });

  it("drops the old grant without revoking it when the provider's revoke ends every grant of the client", async () => {
    const test = exampleFlow({ revokeEndsClientGrants: true });
    await signInWith(test, "fake-code-1");
    test.answerWith({
      status: 200,
      body: { access_token: fakeAccessToken, token_type: "Bearer", refresh_token: newRefreshToken },
    });
    test.seen.length = 0;

    await signInWith(test, "fake-code-2");

    expect(test.seen.map((request) => request.url)).toEqual([
      "https://auth.example.com/oauth/token",
    ]);
    expect(test.outcomes.at(-1)).toMatchObject({ kind: "signedIn", previousGrant: "skipped" });
    expect((await test.grants.find("example", signInName))?.refreshToken).toBe(newRefreshToken);
  });

  it("still revokes the old grant of such a provider when the new sign-in uses another client", async () => {
    const test = exampleFlow({ revokeEndsClientGrants: true });
    await signInWith(test, "fake-code-1");
    test.changeSettings({ clientId: "another-fake-client" });
    test.answerWith({
      status: 200,
      body: { access_token: fakeAccessToken, token_type: "Bearer", refresh_token: newRefreshToken },
    });

    await signInWith(test, "fake-code-2");

    expect(test.seen.map((request) => request.url)).toContain(
      "https://auth.example.com/oauth/revoke",
    );
    expect(test.outcomes.at(-1)).toMatchObject({ kind: "signedIn", previousGrant: "revoked" });
  });

  it("revokes nothing when no grant was there", async () => {
    const test = exampleFlow();

    await signInWith(test, "fake-code-1");

    expect(test.seen.map((request) => request.url)).toEqual([
      "https://auth.example.com/oauth/token",
    ]);
    expect(test.outcomes[0]).not.toHaveProperty("previousGrant");
  });

  it("keeps the old grant when the new sign-in is refused", async () => {
    const test = exampleFlow();
    await signInWith(test, "fake-code-1");
    test.answerWith({ status: 200, body: { access_token: fakeAccessToken, token_type: "mac" } });
    test.seen.length = 0;

    await signInWith(test, "fake-code-2");

    expect(test.seen.map((request) => request.url)).toEqual([
      "https://auth.example.com/oauth/token",
    ]);
    expect((await test.grants.find("example", signInName))?.refreshToken).toBe(rotatedRefreshToken);
  });

  it.each([
    [
      "a token type that isn't bearer",
      { access_token: fakeAccessToken, token_type: "mac", refresh_token: fakeAccessToken },
    ],
    ["no access token", { token_type: "bearer", refresh_token: fakeAccessToken }],
    [
      "a one-character access token",
      { access_token: "x", token_type: "bearer", refresh_token: fakeAccessToken },
    ],
    [
      "an access token with a space",
      {
        access_token: `${fakeAccessToken} 1`,
        token_type: "bearer",
        refresh_token: fakeAccessToken,
      },
    ],
    [
      "an access token with a line break",
      {
        access_token: `${fakeAccessToken}\r\nX: 1`,
        token_type: "bearer",
        refresh_token: fakeAccessToken,
      },
    ],
    [
      "a short refresh token",
      { access_token: fakeAccessToken, token_type: "bearer", refresh_token: shortToken },
    ],
  ])("saves nothing for %s", async (_name, body) => {
    const test = exampleFlow();
    test.answerWith({ status: 200, body });
    const started = await test.started();

    await test.flow.handleCallback(started.callback({ state: started.state, code: "c" }));

    expect(test.outcomes[0]?.kind).toBe("tokenAnswerRefused");
    expect(test.values.size).toBe(0);
  });

  it("saves nothing when the answer has no refresh token", async () => {
    const test = exampleFlow();
    test.answerWith({ status: 200, body: { access_token: fakeAccessToken, token_type: "bearer" } });
    const started = await test.started();

    await test.flow.handleCallback(started.callback({ state: started.state, code: "c" }));

    expect(test.outcomes[0]?.kind).toBe("noRefreshToken");
    expect(test.values.size).toBe(0);
  });

  it("reports a failed sign-in and answers 500 when the store can't be written", async () => {
    const test = exampleFlow();
    test.failStoreWrites();
    const started = await test.started();

    const response = await test.flow.handleCallback(
      started.callback({ state: started.state, code: "fake-code-1" }),
    );

    expect(response.status).toBe(500);
    expect(test.outcomes).toEqual([{ kind: "failed", signIn: signInName }]);
    const shown = JSON.stringify(test.outcomes) + (await response.text());
    expect(shown).not.toContain("fake-code-1");
    expect(shown).not.toContain("fake store failure");
    const again = await test.flow.handleCallback(
      started.callback({ state: started.state, code: "fake-code-1" }),
    );
    expect(again.status).toBe(400);
    expect(test.outcomes).toHaveLength(1);
  });

  it("says which scopes the provider granted differently", async () => {
    const test = exampleFlow();
    test.answerWith({
      status: 200,
      body: {
        access_token: fakeAccessToken,
        token_type: "bearer",
        refresh_token: rotatedRefreshToken,
        scope: "profile",
      },
    });
    const started = await test.started();

    await test.flow.handleCallback(started.callback({ state: started.state, code: "c" }));

    expect(test.outcomes).toEqual([
      {
        kind: "signedIn",
        signIn: signInName,
        missingScopes: ["projects.read"],
        extraScopes: ["profile"],
      },
    ]);
  });

  it("shows no code, error description or secret in the page or the outcome", async () => {
    const test = exampleFlow();
    test.answerWith({
      status: 400,
      body: { error: "invalid_request", error_description: `echo ${fakeClientSecret} fake-code-1` },
    });
    const started = await test.started();

    const response = await test.flow.handleCallback(
      started.callback({ state: started.state, code: "fake-code-1" }),
    );

    const shown = JSON.stringify(test.outcomes) + (await response.text());
    expect(shown).not.toContain("fake-code-1");
    expect(shown).not.toContain(fakeClientSecret);
    expect(shown).not.toContain("echo");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'");
  });

  it("says a provider's error code and shows no error description", async () => {
    const test = exampleFlow();
    const started = await test.started();

    const response = await test.flow.handleCallback(
      started.callback({
        state: started.state,
        error: "server_error",
        error_description: "<b>x</b>",
      }),
    );

    expect(test.outcomes).toEqual([
      { kind: "providerError", signIn: signInName, errorCode: "server_error" },
    ]);
    expect(await response.text()).not.toContain("<b>");
  });

  it("says cancelled when the user refused", async () => {
    const test = exampleFlow();
    const started = await test.started();

    await test.flow.handleCallback(
      started.callback({ state: started.state, error: "access_denied" }),
    );

    expect(test.outcomes).toEqual([{ kind: "cancelled", signIn: signInName }]);
  });

  it("says the provider couldn't be reached", async () => {
    const test = exampleFlow();
    test.answerWith("unreachable");
    const started = await test.started();

    await test.flow.handleCallback(started.callback({ state: started.state, code: "c" }));

    expect(test.outcomes[0]?.kind).toBe("unreachable");
  });

  it("counts a token URL on http as unreachable and never calls the client", async () => {
    const test = exampleFlow({ tokenUrl: "http://auth.example.com/oauth/token" });
    const started = await test.started();

    await test.flow.handleCallback(started.callback({ state: started.state, code: "c" }));

    expect(test.outcomes[0]?.kind).toBe("unreachable");
    expect(test.seen).toEqual([]);
  });

  it("doesn't start when the client secret isn't in the store, or a setting is missing, or the name is unknown", async () => {
    const missingSecret = exampleFlow();
    missingSecret.withoutClientSecret();
    const missingSetting = exampleFlow({ settings: {} });

    expect((await missingSecret.flow.start(signInName, flowPort)).kind).toBe("clientSecretMissing");
    expect((await missingSetting.flow.start(signInName, flowPort)).kind).toBe("settingsInvalid");
    expect((await missingSetting.flow.start("other", flowPort)).kind).toBe("unknown");
  });

  it("answers nothing for a sign-in that was cancelled", async () => {
    const test = exampleFlow();
    const started = await test.started();

    test.flow.cancel(signInName);
    const response = await test.flow.handleCallback(
      started.callback({ state: started.state, code: "c" }),
    );

    expect(response.status).toBe(400);
    expect(test.seen).toEqual([]);
  });

  it("keeps the authorize URL's extra query parameters but never lets the sheet set the flow's own", async () => {
    const test = exampleFlow();

    const started = await test.started();

    expect(started.authorizeUrl.searchParams.getAll("state")).toHaveLength(1);
    expect(started.authorizeUrl.searchParams.getAll("redirect_uri")).toHaveLength(1);
  });

  it.each([
    ["wrongClientSecret", 401, { error: "invalid_client" }],
    ["codeRefused", 400, { error: "invalid_grant" }],
    ["unexpectedAnswer", 502, "not an object"],
  ])("says %s for the provider's answer", async (kind, status, body) => {
    const test = exampleFlow();
    test.answerWith({ status, body });
    const started = await test.started();

    await test.flow.handleCallback(started.callback({ state: started.state, code: "c" }));

    expect(test.outcomes[0]?.kind).toBe(kind);
    expect(test.values.size).toBe(0);
  });

  it("refuses when the client secret has gone from the store since the start", async () => {
    const test = exampleFlow();
    const started = await test.started();

    test.withoutClientSecret();
    await test.flow.handleCallback(started.callback({ state: started.state, code: "c" }));

    expect(test.outcomes).toEqual([{ kind: "clientSecretMissing", signIn: signInName }]);
    expect(test.seen).toEqual([]);
  });

  it("answers only GET", async () => {
    const test = exampleFlow();
    const started = await test.started();

    const response = await test.flow.handleCallback(
      new Request(started.callback({ state: started.state, code: "c" }).url, { method: "POST" }),
    );

    expect(response.status).toBe(400);
    expect(test.seen).toEqual([]);
  });
});
