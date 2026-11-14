import { type Clock, SignInNeededError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approvedExample, webDigest } from "./approved-sign-in.test-helper.ts";
import { fakeProvider, sentForm } from "./fake-provider.test-helper.ts";
import { createSignInGrants } from "./sign-in-grants.ts";
import { createSignInTokens } from "./sign-in-tokens.ts";

// Fake values only; none is real.
const firstRefreshToken = "fake-refresh-token-0000000001";
const rotatedRefreshToken = "fake-refresh-token-0000000002";
const fakeSecret = "fake-client-secret-0000000001";
const tokenAt = (n: number) => `fake-access-token-000000000${n}`;

function setup(answer: () => Response, approved = approvedExample) {
  const values = new Map<string, string>();
  const grants = createSignInGrants(
    {
      get: async (name) => values.get(name) ?? null,
      set: async (name, value) => void values.set(name, value),
      remove: async (name) => void values.delete(name),
    },
    webDigest,
  );
  let nowMs = Date.UTC(2026, 10, 13);
  const clock: Clock = { now: () => new Date(nowMs) };
  const http = fakeProvider(answer);
  const tokens = createSignInTokens({
    integration: "gitlab",
    grants,
    http,
    secrets: { get: async (name) => (name === "example-client" ? fakeSecret : null) },
    clock,
    resolveSignIn: async (name) => (name === "work-account" ? approved : undefined),
    requestSignal: () => new AbortController().signal,
  });
  return {
    tokens,
    grants,
    http,
    saveGrant: () =>
      grants.save("gitlab", "work-account", { refreshToken: firstRefreshToken, approved }),
    passSeconds: (seconds: number) => {
      nowMs += seconds * 1000;
    },
  };
}

/** Answers with a new access token each time, so a second refresh can be seen. */
function numberedAnswers(extra: Record<string, unknown> = {}) {
  let count = 0;
  return () =>
    Response.json({
      access_token: tokenAt(++count),
      token_type: "Bearer",
      expires_in: 3600,
      ...extra,
    });
}

verifies("oauth-sign-in.sign-in-tokens", () => {
  it("refreshes once for eight requests that need a token at once", async () => {
    const { tokens, http, saveGrant } = setup(numberedAnswers());
    await saveGrant();

    const values = await Promise.all(
      Array.from({ length: 8 }, () => tokens.access("work-account")),
    );

    expect(http.received).toHaveLength(1);
    expect(new Set(values)).toEqual(new Set([tokenAt(1)]));
    expect(sentForm(http.received[0])).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: firstRefreshToken,
      client_secret: fakeSecret,
    });
  });

  it("reuses a token with more than 60 seconds left and refreshes one with less", async () => {
    const { tokens, http, saveGrant, passSeconds } = setup(numberedAnswers());
    await saveGrant();
    await tokens.access("work-account");

    passSeconds(3000);
    expect(await tokens.access("work-account")).toBe(tokenAt(1));
    passSeconds(545);
    expect(await tokens.access("work-account")).toBe(tokenAt(2));
    expect(http.received).toHaveLength(2);
  });

  it("uses a token that lives under 60 seconds for half its life instead of refreshing on every access", async () => {
    const { tokens, http, saveGrant, passSeconds } = setup(numberedAnswers({ expires_in: 40 }));
    await saveGrant();
    await tokens.access("work-account");

    passSeconds(19);
    expect(await tokens.access("work-account")).toBe(tokenAt(1));
    expect(http.received).toHaveLength(1);
    passSeconds(1);
    expect(await tokens.access("work-account")).toBe(tokenAt(2));
    expect(http.received).toHaveLength(2);
  });

  it("places a token without expires_in until it has 60 seconds of a five-minute life left, and keeps it in the filter until the process ends", async () => {
    let count = 0;
    const { tokens, saveGrant, passSeconds } = setup(() =>
      Response.json({ access_token: tokenAt(++count), token_type: "Bearer" }),
    );
    await saveGrant();
    const first = await tokens.access("work-account");

    passSeconds(200);
    expect(await tokens.access("work-account")).toBe(first);
    passSeconds(100);
    const second = await tokens.access("work-account");

    expect(second).toBe(tokenAt(2));
    expect(tokens.filterValues()).toContain(first);
  });

  it("saves a rotated refresh token before it hands out the new access token", async () => {
    const { tokens, grants, saveGrant } = setup(
      numberedAnswers({ refresh_token: rotatedRefreshToken }),
    );
    await saveGrant();

    await tokens.access("work-account");

    const found = await grants.load("gitlab", "work-account", approvedExample);
    expect(found).toMatchObject({ kind: "current", grant: { refreshToken: rotatedRefreshToken } });
  });

  it("refreshes after a 401 for the current token that is at least 30 seconds old", async () => {
    const { tokens, http, saveGrant, passSeconds } = setup(numberedAnswers());
    await saveGrant();
    const first = await tokens.access("work-account");

    tokens.rejected("work-account", "fake-access-token-never-issued");
    expect(await tokens.access("work-account")).toBe(first);

    passSeconds(30);
    tokens.rejected("work-account", first);
    expect(await tokens.access("work-account")).toBe(tokenAt(2));
    expect(http.received).toHaveLength(2);
  });

  it("doesn't refresh again for a 401 on a token under 30 seconds old, or on a replaced one", async () => {
    const { tokens, http, saveGrant, passSeconds } = setup(numberedAnswers());
    await saveGrant();
    const first = await tokens.access("work-account");
    passSeconds(30);
    tokens.rejected("work-account", first);
    const second = await tokens.access("work-account");

    passSeconds(29);
    tokens.rejected("work-account", second);
    tokens.rejected("work-account", first);

    expect(await tokens.access("work-account")).toBe(second);
    expect(http.received).toHaveLength(2);
  });

  it("asks the user to sign in when nothing current is saved", async () => {
    const { tokens, http } = setup(numberedAnswers());

    await expect(tokens.access("work-account")).rejects.toBeInstanceOf(SignInNeededError);
    await expect(tokens.access("other")).rejects.toBeInstanceOf(SignInNeededError);
    const changed = { ...approvedExample, revokeUrl: "https://evil.example.com/revoke" };
    const stale = setup(numberedAnswers(), changed);
    await stale.grants.save("gitlab", "work-account", {
      refreshToken: firstRefreshToken,
      approved: approvedExample,
    });
    await expect(stale.tokens.access("work-account")).rejects.toBeInstanceOf(SignInNeededError);
    expect(http.received).toHaveLength(0);
    expect(stale.http.received).toHaveLength(0);
  });

  it("removes the grant when the server answers invalid_grant, and keeps it when it can't be reached", async () => {
    const refused = setup(() => Response.json({ error: "invalid_grant" }, { status: 400 }));
    await refused.saveGrant();
    await expect(refused.tokens.access("work-account")).rejects.toBeInstanceOf(SignInNeededError);
    expect(await refused.grants.load("gitlab", "work-account", approvedExample)).toEqual({
      kind: "none",
    });

    const offline = setup(() => {
      throw new Error("network down");
    });
    await offline.saveGrant();
    const failure = await offline.tokens.access("work-account").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(SignInNeededError);
    expect(await offline.grants.load("gitlab", "work-account", approvedExample)).toMatchObject({
      kind: "current",
    });
  });

  it("lists the access tokens until 10 minutes after their expiry, the refresh token and the client secret for the filter", async () => {
    const { tokens, saveGrant, passSeconds } = setup(numberedAnswers());
    await saveGrant();
    expect(tokens.filterValues()).toEqual([]);

    const first = await tokens.access("work-account");
    passSeconds(3600 + 599);
    expect(tokens.filterValues()).toContain(first);
    passSeconds(1);
    const second = await tokens.access("work-account");

    expect(tokens.filterValues()).toEqual([second, firstRefreshToken, fakeSecret]);
    expect(tokens.filterValues()).not.toContain(first);
  });

  it("stops waiting when the caller's signal aborts, and leaves the refresh to the others", async () => {
    const { tokens, http, saveGrant } = setup(numberedAnswers());
    await saveGrant();
    const others = tokens.access("work-account");
    const abort = new AbortController();
    const gaveUp = tokens.access("work-account", abort.signal);
    abort.abort(new Error("gave up"));

    await expect(gaveUp).rejects.toThrow("gave up");
    expect(await others).toBe(tokenAt(1));
    expect(http.received).toHaveLength(1);
  });

  it("starts no refresh for a signal that is already aborted, so a failing one can't go unhandled", async () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", record);
    try {
      const { tokens, http, saveGrant } = setup(() => {
        throw new Error("network down");
      });
      await saveGrant();
      const abort = new AbortController();
      abort.abort(new Error("gave up"));

      await expect(tokens.access("work-account", abort.signal)).rejects.toThrow("gave up");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(http.received).toHaveLength(0);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", record);
    }
  });

  it("settles only when the refresh in flight has ended, ended well or not", async () => {
    const { tokens, saveGrant } = setup(numberedAnswers());
    await saveGrant();
    const waiting = tokens.access("work-account");

    await tokens.settled("work-account");

    expect(tokens.filterValues()).toContain(tokenAt(1));
    await waiting;
  });

  it("settles when the refresh in flight failed, and when none is running", async () => {
    const { tokens, saveGrant } = setup(() => {
      throw new Error("network down");
    });
    await saveGrant();
    const failed = tokens.access("work-account");

    await expect(tokens.settled("work-account")).resolves.toBeUndefined();
    await expect(failed).rejects.toThrow();
    await expect(tokens.settled("work-account")).resolves.toBeUndefined();
    await expect(tokens.settled("never-used")).resolves.toBeUndefined();
  });
});
