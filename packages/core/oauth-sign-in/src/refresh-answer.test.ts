import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readRefreshAnswer } from "./refresh-answer.ts";
import { isUsableToken, maxTokenLength } from "./usable-token.ts";

// Fake values only; none is real.
const fakeAccessToken = "fake-access-token-0000000001";
const fakeRefreshToken = "fake-refresh-token-0000000001";
const fakeSecret = "fake-client-secret-0000000001";

const success = {
  access_token: fakeAccessToken,
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: fakeRefreshToken,
  scope: "profile  projects.read",
};

verifies("oauth-sign-in.refresh-answer", () => {
  it("reads the access token, the lifetime, a rotated refresh token and the scopes", () => {
    expect(readRefreshAnswer({ status: 200, json: success })).toEqual({
      kind: "refreshed",
      accessToken: fakeAccessToken,
      expiresIn: 3600,
      refreshToken: fakeRefreshToken,
      grantedScopes: ["profile", "projects.read"],
    });
  });

  it("accepts a success with only a bearer access token, with any case of bearer", () => {
    expect(
      readRefreshAnswer({
        status: 200,
        json: { access_token: fakeAccessToken, token_type: "bearer" },
      }),
    ).toEqual({ kind: "refreshed", accessToken: fakeAccessToken });
  });

  it("treats an expires_in that isn't a positive number as absent", () => {
    for (const expiresIn of [0, -5, "3600", null, Number.NaN]) {
      const meaning = readRefreshAnswer({
        status: 200,
        json: { ...success, expires_in: expiresIn },
      });

      expect(meaning).toMatchObject({ kind: "refreshed" });
      expect(meaning).not.toHaveProperty("expiresIn");
    }
  });

  it("maps invalid_grant to grantRefused and invalid_client to clientRefused", () => {
    expect(readRefreshAnswer({ status: 400, json: { error: "invalid_grant" } })).toEqual({
      kind: "grantRefused",
    });
    expect(readRefreshAnswer({ status: 401, json: { error: "invalid_client" } })).toEqual({
      kind: "clientRefused",
    });
  });

  it("keeps any other error as the provider's code with the status", () => {
    expect(readRefreshAnswer({ status: 503, json: { error: "temporarily_unavailable" } })).toEqual({
      kind: "providerError",
      errorCode: "temporarily_unavailable",
      status: 503,
    });
    expect(readRefreshAnswer({ status: 500, json: {} })).toEqual({
      kind: "providerError",
      errorCode: "unrecognised",
      status: 500,
    });
  });

  it("never keeps error_description or an error value that echoes the request", () => {
    for (const json of [
      { error: "invalid_request", error_description: `refresh_token=${fakeRefreshToken}` },
      { error: `client_secret=${fakeSecret}` },
    ]) {
      const meaning = JSON.stringify(readRefreshAnswer({ status: 400, json }));

      expect(meaning).not.toContain(fakeRefreshToken);
      expect(meaning).not.toContain(fakeSecret);
    }
  });

  describe("gives unexpectedAnswer, and keeps nothing, for", () => {
    it.each([
      ["a body that isn't a JSON object", undefined],
      ["an array", [success]],
      ["a missing access token", { ...success, access_token: undefined }],
      ["a token type other than bearer", { ...success, token_type: "mac" }],
      ["a missing token type", { ...success, token_type: undefined }],
      ["a one-character access token", { ...success, access_token: "x" }],
      ["an access token with a space", { ...success, access_token: `${fakeAccessToken} x` }],
      ["an access token with a line break", { ...success, access_token: `${fakeAccessToken}\r\n` }],
      ["a refresh token that is too short", { ...success, refresh_token: "short" }],
      ["a refresh token that isn't text", { ...success, refresh_token: 1234567890123456 }],
    ])("%s", (_name, json) => {
      expect(readRefreshAnswer({ status: 200, json })).toEqual({
        kind: "unexpectedAnswer",
        status: 200,
      });
    });

    it("treats an empty or null refresh token as absent, not as a failure", () => {
      for (const refreshToken of ["", null]) {
        const meaning = readRefreshAnswer({
          status: 200,
          json: { ...success, refresh_token: refreshToken },
        });

        expect(meaning).toMatchObject({ kind: "refreshed" });
        expect(meaning).not.toHaveProperty("refreshToken");
      }
    });
  });
});

verifies("oauth-sign-in.usable-token", () => {
  it("accepts visible ASCII of 16 characters or more", () => {
    expect(isUsableToken("a".repeat(16))).toBe(true);
    expect(isUsableToken("Aa0!~-_.=+/".repeat(3))).toBe(true);
  });

  it("accepts a token of the longest length and refuses one character more", () => {
    expect(maxTokenLength).toBe(4096);
    expect(isUsableToken("a".repeat(4096))).toBe(true);
    expect(isUsableToken("a".repeat(4097))).toBe(false);
    expect(isUsableToken("a".repeat(1024 * 1024))).toBe(false);
  });

  it.each([
    ["one character", "x"],
    ["15 characters", "a".repeat(15)],
    ["a space", `${"a".repeat(16)} b`],
    ["a line break", `${"a".repeat(16)}\n`],
    ["a tab", `${"a".repeat(16)}\t`],
    ["a character outside ASCII", `${"a".repeat(16)}é`],
    ["a control character", `${"a".repeat(16)}\u0000`],
    ["an empty string", ""],
  ])("refuses %s", (_name, value) => {
    expect(isUsableToken(value)).toBe(false);
  });

  it("refuses a value that isn't text", () => {
    for (const value of [undefined, null, 1234567890123456, {}, ["a".repeat(16)]]) {
      expect(isUsableToken(value)).toBe(false);
    }
  });
});
