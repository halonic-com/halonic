import { SignInNeededError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approvedExample, webDigest } from "./approved-sign-in.test-helper.ts";
import { fakeProvider, sentForm } from "./fake-provider.test-helper.ts";
import { createSignInGrants } from "./sign-in-grants.ts";
import { createSignInTokens } from "./sign-in-tokens.ts";
import { signOut } from "./sign-out.ts";

// Fake values only; none is real.
const refreshToken = "fake-refresh-token-0000000001";
const accessToken = `fake-access-token-${"0".repeat(9)}1`;
const fakeSecret = "fake-client-secret-0000000001";

function setup(answer: () => Response, secretIsSet = true) {
  const values = new Map<string, string>();
  const grants = createSignInGrants(
    {
      get: async (name) => values.get(name) ?? null,
      set: async (name, value) => void values.set(name, value),
      remove: async (name) => void values.delete(name),
    },
    webDigest,
  );
  const http = fakeProvider(answer);
  const secrets = { get: async () => (secretIsSet ? fakeSecret : null) };
  const settings = {
    integration: "gitlab",
    grants,
    http,
    secrets,
    requestSignal: () => new AbortController().signal,
  };
  return {
    grants,
    http,
    settings,
    save: (approved = approvedExample) =>
      grants.save("gitlab", "work-account", { refreshToken, approved }),
  };
}

const ok = () => new Response(null, { status: 200 });

verifies("oauth-sign-in.sign-out", () => {
  it("revokes at the approved endpoint with the approved client, then removes the grant", async () => {
    const { settings, grants, http, save } = setup(ok);
    await save();

    const result = await signOut(settings, "work-account");

    expect(result).toEqual({ kind: "signedOut", revoke: "revoked" });
    expect(http.received).toHaveLength(1);
    expect(http.received[0]?.url).toBe(approvedExample.revokeUrl);
    expect(sentForm(http.received[0])).toMatchObject({
      token: refreshToken,
      client_id: "fake-client",
      client_secret: fakeSecret,
    });
    expect(await grants.find("gitlab", "work-account")).toBeUndefined();
  });

  it("revokes at the approved endpoint even when the sheet has since changed it or dropped the sign-in", async () => {
    // The grant holds its own approved sign-in; the sheet isn't consulted at all.
    const { settings, http, save } = setup(ok);
    await save({ ...approvedExample, revokeUrl: "https://auth.example.com/old/revoke" });

    await signOut(settings, "work-account");

    expect(http.received[0]?.url).toBe("https://auth.example.com/old/revoke");
  });

  it("sends no revoke when the server's revoke would end the grant that replaces this one", async () => {
    const { settings, grants, http, save } = setup(ok);
    const endsClientGrants = { ...approvedExample, revokeEndsClientGrants: true as const };
    await save(endsClientGrants);

    const result = await signOut(settings, "work-account", approvedExample);

    expect(result).toEqual({ kind: "signedOut", revoke: "skipped" });
    expect(http.received).toEqual([]);
    expect(await grants.find("gitlab", "work-account")).toBeUndefined();
  });

  it("still revokes for a replacing grant of another client or server, or when the old one doesn't say its revoke ends client grants", async () => {
    const endsClientGrants = { ...approvedExample, revokeEndsClientGrants: true as const };
    const cases = [
      [endsClientGrants, { ...approvedExample, clientId: "another-fake-client" }],
      [endsClientGrants, { ...approvedExample, tokenUrl: "https://other.example.com/token" }],
      [endsClientGrants, { ...approvedExample, revokeUrl: "https://other.example.com/revoke" }],
      [approvedExample, approvedExample],
    ] as const;
    for (const [old, replacement] of cases) {
      const { settings, http, save } = setup(ok);
      await save(old);

      const result = await signOut(settings, "work-account", replacement);

      expect(result).toEqual({ kind: "signedOut", revoke: "revoked" });
      expect(http.received).toHaveLength(1);
    }
  });

  it("removes the grant and says notConfirmed when the server fails or can't be reached", async () => {
    for (const answer of [
      () => new Response(null, { status: 503 }),
      () => {
        throw new Error("connect failed");
      },
    ]) {
      const { settings, grants, save } = setup(answer);
      await save();

      expect(await signOut(settings, "work-account")).toEqual({
        kind: "signedOut",
        revoke: "notConfirmed",
      });
      expect(await grants.find("gitlab", "work-account")).toBeUndefined();
    }
  });

  it("removes the grant without a request when the client secret is not set", async () => {
    const { settings, grants, http, save } = setup(ok, false);
    await save();

    expect(await signOut(settings, "work-account")).toEqual({
      kind: "signedOut",
      revoke: "notConfirmed",
    });
    expect(http.received).toHaveLength(0);
    expect(await grants.find("gitlab", "work-account")).toBeUndefined();
  });

  it("sends nothing when the approved sign-in has no revoke endpoint", async () => {
    const { revokeUrl: _omitted, ...withoutRevoke } = approvedExample;
    const { settings, grants, http, save } = setup(ok);
    await save(withoutRevoke);

    expect(await signOut(settings, "work-account")).toEqual({
      kind: "signedOut",
      revoke: "noRevokeUrl",
    });
    expect(http.received).toHaveLength(0);
    expect(await grants.find("gitlab", "work-account")).toBeUndefined();
  });

  it("says notSignedIn and sends nothing when no grant is saved", async () => {
    const { settings, http } = setup(ok);

    expect(await signOut(settings, "work-account")).toEqual({ kind: "notSignedIn" });
    expect(http.received).toHaveLength(0);
  });

  it("stops giving out the access token in use once the sign-in is forgotten", async () => {
    const { settings, grants, save } = setup(() =>
      Response.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
      }),
    );
    await save();
    const tokens = createSignInTokens({
      ...settings,
      clock: { now: () => new Date(Date.UTC(2026, 10, 13)) },
      resolveSignIn: async () => approvedExample,
    });
    expect(await tokens.access("work-account")).toBe(accessToken);

    await signOut(settings, "work-account");
    tokens.forget("work-account");

    await expect(tokens.access("work-account")).rejects.toBeInstanceOf(SignInNeededError);
    expect(await grants.find("gitlab", "work-account")).toBeUndefined();
  });
});
