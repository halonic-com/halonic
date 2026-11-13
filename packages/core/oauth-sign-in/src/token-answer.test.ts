import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { classifyTokenAnswer } from "./token-answer.ts";

// Fake values only; none is a real token.
const fakeAccessToken = "fake-access-token";
const fakeRefreshToken = "fake-refresh-token";
const fakeIdToken = "fake.id.token";
const fakeSecret = "fake-client-secret";

verifies("oauth-sign-in.token-answer", () => {
  it("returns the refresh token, the ID token and the granted scopes, not the access token", () => {
    const meaning = classifyTokenAnswer({
      status: 200,
      json: {
        access_token: fakeAccessToken,
        refresh_token: fakeRefreshToken,
        id_token: fakeIdToken,
        scope: "openid  profile",
        token_type: "Bearer",
      },
    });

    expect(meaning).toEqual({
      kind: "tokens",
      refreshToken: fakeRefreshToken,
      idToken: fakeIdToken,
      grantedScopes: ["openid", "profile"],
    });
    expect(JSON.stringify(meaning)).not.toContain(fakeAccessToken);
  });

  it("accepts a success with only an access token: the rest is optional", () => {
    expect(classifyTokenAnswer({ status: 200, json: { access_token: fakeAccessToken } })).toEqual({
      kind: "tokens",
    });
  });

  it("maps invalid_client to wrongClientSecret and invalid_grant to codeRefused", () => {
    expect(classifyTokenAnswer({ status: 401, json: { error: "invalid_client" } })).toEqual({
      kind: "wrongClientSecret",
    });
    expect(classifyTokenAnswer({ status: 400, json: { error: "invalid_grant" } })).toEqual({
      kind: "codeRefused",
    });
  });

  it("keeps any other error as the provider's code with the status", () => {
    expect(classifyTokenAnswer({ status: 400, json: { error: "unauthorized_client" } })).toEqual({
      kind: "providerError",
      errorCode: "unauthorized_client",
      status: 400,
    });
    expect(classifyTokenAnswer({ status: 500, json: {} })).toEqual({
      kind: "providerError",
      errorCode: "unrecognised",
      status: 500,
    });
  });

  it("gives unexpectedAnswer for a body that isn't a JSON object", () => {
    for (const json of [undefined, null, "<html>Error</html>", [{ access_token: "x" }], 42]) {
      expect(classifyTokenAnswer({ status: 502, json })).toEqual({
        kind: "unexpectedAnswer",
        status: 502,
      });
    }
  });

  it("never keeps error_description or an error value that echoes the request", () => {
    const hostile = [
      { error: "invalid_request", error_description: `client_secret=${fakeSecret}` },
      { error: `client_secret=${fakeSecret}`, error_description: fakeSecret },
      { error: "invalid_client", error_description: fakeSecret },
    ];

    for (const json of hostile) {
      expect(JSON.stringify(classifyTokenAnswer({ status: 400, json }))).not.toContain(fakeSecret);
    }
  });
});
