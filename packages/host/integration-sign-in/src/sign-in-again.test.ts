import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { exampleFlow } from "./fake-flow.test-helper.ts";
import {
  fakeAccessToken,
  rotatedRefreshToken,
  signInName,
} from "./fake-integration.test-helper.ts";

const newRefreshToken = "fake-refresh-token-of-the-second-sign-in";

/** Starts a sign-in and answers its callback with the code. */
async function signInWith(test: ReturnType<typeof exampleFlow>, code: string): Promise<void> {
  const started = await test.started();
  await test.flow.handleCallback(started.callback({ state: started.state, code }));
}

verifies("integration-sign-in.sign-in-flow", () => {
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

  it("skips the revoke of a grant approved before the sheet said the provider's revoke ends client grants", async () => {
    const test = exampleFlow();
    await signInWith(test, "fake-code-1");
    test.declareRevokeEndsClientGrants();
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
  });

  it("revokes nothing when no grant was there", async () => {
    const test = exampleFlow();

    await signInWith(test, "fake-code-1");

    expect(test.seen.map((request) => request.url)).toEqual([
      "https://auth.example.com/oauth/token",
    ]);
    expect(test.outcomes[0]).not.toHaveProperty("previousGrant");
  });
});
