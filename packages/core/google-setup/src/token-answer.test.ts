import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { classifyTokenAnswer } from "./token-answer.ts";

// Fake values only; none is a real token.
const fakeAccessToken = "fake-access-token";
const fakeRefreshToken = "fake-refresh-token";
const fakeIdToken = "fake.id.token";
const fakeCode = "fake-authorisation-code";
const fakeSecret = "fake-client-secret";
const gmail = "https://www.googleapis.com/auth/gmail.readonly";

const success = {
  access_token: fakeAccessToken,
  expires_in: 3599,
  refresh_token: fakeRefreshToken,
  id_token: fakeIdToken,
  scope: `openid ${gmail} https://www.googleapis.com/auth/userinfo.email`,
  token_type: "Bearer",
};

verifies("google-setup.sign-in-token-answer", () => {
  it("returns the refresh token, the ID token and the scopes Google granted, not the access token", () => {
    const meaning = classifyTokenAnswer({ status: 200, json: success });

    expect(meaning).toEqual({
      kind: "tokens",
      refreshToken: fakeRefreshToken,
      idToken: fakeIdToken,
      grantedScopes: ["openid", gmail, "https://www.googleapis.com/auth/userinfo.email"],
    });
    expect(JSON.stringify(meaning)).not.toContain("fake-access-token");
  });

  it("maps invalid_client to wrongClientSecret and invalid_grant to codeRefused", () => {
    expect(classifyTokenAnswer({ status: 401, json: { error: "invalid_client" } })).toEqual({
      kind: "wrongClientSecret",
    });
    expect(classifyTokenAnswer({ status: 400, json: { error: "invalid_grant" } })).toEqual({
      kind: "codeRefused",
    });
  });

  it("gives noRefreshToken for a success without one", () => {
    const { refresh_token: _left, ...withoutRefreshToken } = success;

    expect(classifyTokenAnswer({ status: 200, json: withoutRefreshToken })).toEqual({
      kind: "noRefreshToken",
    });
  });

  it("keeps any other error as Google's code with the status", () => {
    expect(classifyTokenAnswer({ status: 400, json: { error: "unauthorized_client" } })).toEqual({
      kind: "googleError",
      errorCode: "unauthorized_client",
      status: 400,
    });
    expect(classifyTokenAnswer({ status: 500, json: {} })).toEqual({
      kind: "googleError",
      errorCode: "unrecognised",
      status: 500,
    });
  });

  it("gives unexpectedAnswer for a body that isn't a JSON object, or a success without an ID token or scope", () => {
    const { id_token: _id, ...withoutIdToken } = success;
    const { scope: _scope, ...withoutScope } = success;

    for (const json of [undefined, null, "<html>Error</html>", [success], 42]) {
      expect(classifyTokenAnswer({ status: 502, json })).toEqual({
        kind: "unexpectedAnswer",
        status: 502,
      });
    }
    expect(classifyTokenAnswer({ status: 200, json: withoutIdToken }).kind).toBe(
      "unexpectedAnswer",
    );
    expect(classifyTokenAnswer({ status: 200, json: withoutScope }).kind).toBe("unexpectedAnswer");
  });
});

verifies("google-setup.sign-in-no-secret-echo", () => {
  it("never keeps error_description or an error value that echoes the request", () => {
    const hostile = [
      {
        error: "invalid_request",
        error_description: `code=${fakeCode}&client_secret=${fakeSecret}`,
      },
      { error: `code=${fakeCode}`, error_description: fakeSecret },
      { error: "invalid_client", error_description: fakeSecret },
    ];

    for (const json of hostile) {
      const meaning = JSON.stringify(classifyTokenAnswer({ status: 400, json }));
      expect(meaning).not.toContain(fakeCode);
      expect(meaning).not.toContain(fakeSecret);
    }
  });
});
