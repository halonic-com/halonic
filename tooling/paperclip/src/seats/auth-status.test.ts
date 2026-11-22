import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { parseAuthStatus } from "./auth-status.ts";

const seatAccount = "seat-a@acme.test";

function statusJson(fields: Record<string, unknown>): string {
  return JSON.stringify({ loggedIn: true, authMethod: "claude.ai", ...fields }, null, 2);
}

verifies("paperclip.seats-auth-status", () => {
  test("a subscription sign-in for the seat's own account is signed in, without the e-mail", () => {
    const output = statusJson({
      email: "Seat-A@acme.test",
      orgName: "Acme",
      subscriptionType: "max",
      loginExpiresAt: "2026-12-01T00:00:00Z",
    });

    const status = parseAuthStatus(output, seatAccount);

    expect(status).toEqual({
      state: "signed-in",
      account: "matches",
      plan: "max",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
    expect(JSON.stringify(status)).not.toContain("acme.test");
  });

  test("a sign-in for another account differs", () => {
    const output = statusJson({ email: "seat-b@acme.test" });
    expect(parseAuthStatus(output, seatAccount).account).toBe("differs");
  });

  test("without an account set for the seat, the match is unknown", () => {
    const output = statusJson({ email: "seat-a@acme.test" });
    expect(parseAuthStatus(output, undefined).account).toBe("unknown");
    expect(parseAuthStatus(output, " ").account).toBe("unknown");
  });

  test("an API key or cloud provider sign-in is not a subscription", () => {
    expect(parseAuthStatus(statusJson({ authMethod: "api_key" }), seatAccount).state).toBe(
      "not-subscription",
    );
    expect(parseAuthStatus(statusJson({ authMethod: "third_party" }), seatAccount).state).toBe(
      "not-subscription",
    );
  });

  test("nobody signed in is signed out", () => {
    expect(parseAuthStatus('{"loggedIn": false, "authMethod": "none"}', seatAccount)).toEqual({
      state: "signed-out",
      account: "unknown",
      plan: undefined,
      expiresAt: undefined,
    });
  });

  test("an expiry in seconds or milliseconds reads the same", () => {
    const seconds = Date.parse("2026-12-01T00:00:00Z") / 1000;
    expect(parseAuthStatus(statusJson({ loginExpiresAt: seconds }), seatAccount).expiresAt).toBe(
      "2026-12-01T00:00:00.000Z",
    );
    expect(
      parseAuthStatus(statusJson({ loginExpiresAt: seconds * 1000 }), seatAccount).expiresAt,
    ).toBe("2026-12-01T00:00:00.000Z");
    expect(parseAuthStatus(statusJson({ loginExpiresAt: null }), seatAccount).expiresAt).toBe(
      undefined,
    );
  });

  test.each(["", "Not logged in", "[]", '{"authMethod": "claude.ai"}'])(
    "%j is unreadable",
    (output) => {
      expect(parseAuthStatus(output, seatAccount).state).toBe("unreadable");
    },
  );
});
