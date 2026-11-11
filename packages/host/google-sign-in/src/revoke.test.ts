import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import {
  fakeAccountRef,
  fakeGoogle,
  fakeRefreshToken,
  fakeTokenStore,
  hostileError,
} from "./fake-google.test-helper.ts";
import { revokeGoogleSignIn } from "./revoke.ts";

const refreshName = `google-account-${fakeAccountRef}`;

/** A store that holds the account's refresh token, and a fake Google that answers with `answer`. */
function connected(answer: () => Response) {
  const tokens = fakeTokenStore();
  tokens.values.set(refreshName, fakeRefreshToken);
  return { tokens, google: fakeGoogle(answer) };
}

verifies("google-sign-in.revoke", () => {
  it("asks Google to revoke the refresh token, in the form body, and removes it", async () => {
    const { tokens, google } = connected(() => new Response("{}", { status: 200 }));

    expect(await revokeGoogleSignIn(fakeAccountRef, { http: google, tokens })).toEqual({
      kind: "disconnected",
      googleConfirmed: true,
    });
    expect(google.requests).toHaveLength(1);
    const [request] = google.requests;
    expect(request?.url).toBe("https://oauth2.googleapis.com/revoke");
    expect(request?.method).toBe("POST");
    expect(request?.form.get("token")).toBe(fakeRefreshToken);
    // A redirect would carry the refresh token elsewhere; the time limit keeps a stalled Google from hanging a disconnect.
    expect(request?.redirect).toBe("error");
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(tokens.values.has(refreshName)).toBe(false);
  });

  it("removes the token even when Google refuses or can't be reached", async () => {
    const refused = connected(() => hostileError("invalid_token"));
    expect(
      await revokeGoogleSignIn(fakeAccountRef, { http: refused.google, tokens: refused.tokens }),
    ).toEqual({
      kind: "disconnected",
      googleConfirmed: false,
    });
    expect(refused.tokens.values.size).toBe(0);

    const offline = connected(() => {
      throw new Error("network down");
    });
    expect(
      await revokeGoogleSignIn(fakeAccountRef, { http: offline.google, tokens: offline.tokens }),
    ).toEqual({
      kind: "disconnected",
      googleConfirmed: false,
    });
    expect(offline.tokens.values.size).toBe(0);
  });

  it("waits 10 seconds at most for Google", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const { tokens, google } = connected(() => new Response("{}", { status: 200 }));
      await revokeGoogleSignIn(fakeAccountRef, { http: google, tokens });

      expect(timeout.mock.calls).toEqual([[10_000]]);
      expect(google.requests[0]?.signal).toBe(timeout.mock.results[0]?.value);
    } finally {
      timeout.mockRestore();
    }
  });

  it("sends nothing when the account has no refresh token", async () => {
    const google = fakeGoogle(() => new Response("{}"));

    expect(
      await revokeGoogleSignIn(fakeAccountRef, { http: google, tokens: fakeTokenStore() }),
    ).toEqual({
      kind: "nothingToRevoke",
    });
    expect(google.requests).toHaveLength(0);
  });

  it("refuses an account ref that can't name a token", async () => {
    const google = fakeGoogle(() => new Response("{}"));

    await expect(
      revokeGoogleSignIn("account@example.com", { http: google, tokens: fakeTokenStore() }),
    ).rejects.toThrow(RangeError);
  });
});
