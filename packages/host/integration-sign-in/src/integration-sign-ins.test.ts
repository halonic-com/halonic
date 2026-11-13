import { SignInNeededError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  exampleIntegration,
  fakeAccessToken,
  rotatedRefreshToken,
  signInName,
} from "./fake-integration.test-helper.ts";

verifies("host-integration-sign-in.approved-sign-ins", () => {
  it("fills in the sign-in from the sheet and the settings", async () => {
    const { signIns } = exampleIntegration();

    expect(await signIns.lookUp(signInName)).toMatchObject({
      kind: "approvable",
      signIn: {
        clientId: "fake-client",
        tokenUrl: "https://auth.example.com/oauth/token",
        clientSecretName: "example-client",
        accessHosts: ["api.example.com"],
      },
    });
  });

  it("says which setting is wrong instead of giving a half-filled sign-in", async () => {
    const { signIns } = exampleIntegration({ settings: {} });

    const found = await signIns.lookUp(signInName);

    expect(found).toMatchObject({
      kind: "settingsInvalid",
      problems: [{ code: "client-id-missing" }],
    });
  });

  it("says a name the sheet doesn't have is unknown", async () => {
    const { signIns } = exampleIntegration();

    expect(await signIns.lookUp("other-account")).toEqual({ kind: "unknown" });
  });

  it("gives a token for the sign-in the user approved", async () => {
    const test = exampleIntegration();
    await test.signedIn();

    expect(await test.signIns.tokens.access(signInName)).toBe(fakeAccessToken);
  });

  it("asks for a new sign-in once a setting the sign-in reads has changed", async () => {
    const test = exampleIntegration();
    await test.signedIn();

    test.changeSettings({ clientId: "another-fake-client" });

    await expect(test.signIns.tokens.access(signInName)).rejects.toBeInstanceOf(SignInNeededError);
    expect(test.provider.requests).toHaveLength(0);
  });

  it("asks for a new sign-in when the settings can no longer fill the sign-in in", async () => {
    const test = exampleIntegration();
    await test.signedIn();

    test.changeSettings({});

    await expect(test.signIns.tokens.access(signInName)).rejects.toBeInstanceOf(SignInNeededError);
  });

  it("lists the tokens for the secret filter and takes the kit's report of a rejected one", async () => {
    const test = exampleIntegration();
    await test.signedIn();
    const value = await test.signIns.tokens.access(signInName);

    test.signIns.tokens.rejected(signInName, value);

    expect(test.signIns.tokens.filterValues()).toContain(value);
  });

  it("gives the kit no way to forget a token or wait for a refresh", () => {
    const { signIns } = exampleIntegration();

    expect(Object.keys(signIns.tokens).sort()).toEqual(["access", "filterValues", "rejected"]);
  });
});

verifies("host-integration-sign-in.sign-out", () => {
  it("waits for a refresh in flight before it removes the grant, so the refresh can't save it again", async () => {
    const test = exampleIntegration({ hold: true });
    await test.signedIn();
    const access = test.signIns.tokens.access(signInName);
    await until(() => test.provider.requests.length === 1);

    let signedOut = false;
    const signOut = test.signIns.signOut(signInName).then((result) => {
      signedOut = true;
      return result;
    });
    await settleMicrotasks();
    expect(test.provider.requests).toHaveLength(1);
    expect(signedOut).toBe(false);

    test.provider.requests[0]?.release();
    await access;
    await until(() => test.provider.requests.length === 2);
    test.provider.requests[1]?.release();

    expect(await signOut).toEqual({ kind: "signedOut", revoke: "revoked" });
    expect(test.provider.requests[1]?.url).toBe("https://auth.example.com/oauth/revoke");
    expect(test.values.size).toBe(0);
  });

  it("revokes the rotated refresh token the refresh saved", async () => {
    const test = exampleIntegration();
    await test.signedIn();
    await test.signIns.tokens.access(signInName);

    await test.signIns.signOut(signInName);

    const revoke = test.provider.requests[1];
    expect(revoke?.url).toBe("https://auth.example.com/oauth/revoke");
    expect(revoke?.body).toContain(rotatedRefreshToken);
  });

  it("gives no token while it signs out, so no new refresh starts", async () => {
    const test = exampleIntegration({ hold: true });
    await test.signedIn();
    const signOut = test.signIns.signOut(signInName);
    await until(() => test.provider.requests.length === 1);

    await expect(test.signIns.tokens.access(signInName)).rejects.toBeInstanceOf(SignInNeededError);
    test.provider.requests[0]?.release();
    await signOut;

    expect(test.provider.requests).toHaveLength(1);
  });

  it("drops the access token in use, and asks to sign in again afterwards", async () => {
    const test = exampleIntegration();
    await test.signedIn();
    await test.signIns.tokens.access(signInName);

    expect(await test.signIns.signOut(signInName)).toMatchObject({ kind: "signedOut" });

    await expect(test.signIns.tokens.access(signInName)).rejects.toBeInstanceOf(SignInNeededError);
  });

  it("says a sign-in nobody signed in to wasn't signed in", async () => {
    const { signIns, provider } = exampleIntegration();

    expect(await signIns.signOut(signInName)).toEqual({ kind: "notSignedIn" });
    expect(provider.requests).toHaveLength(0);
  });
});

/** Lets every promise that can run, run. */
async function settleMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

async function until(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 100 && !condition(); tries++) {
    await settleMicrotasks();
  }
  expect(condition()).toBe(true);
}
