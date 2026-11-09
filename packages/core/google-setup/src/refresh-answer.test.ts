import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readRefreshAnswer } from "./refresh-answer.ts";

// Fake values only; none is a real token or secret.
const fakeAccessToken = "fake-access-token";
const fakeRefreshToken = "fake-refresh-token";
const fakeNewRefreshToken = "fake-new-refresh-token";
const fakeSecret = "GOCSPX-fake-client-secret";
const gmail = "https://www.googleapis.com/auth/gmail.readonly";

const success = {
  access_token: fakeAccessToken,
  expires_in: 3599,
  scope: `openid ${gmail}`,
  token_type: "Bearer",
};

verifies("google-setup.refresh-answer", () => {
  it("returns the access token, its lifetime and the scopes Google granted", () => {
    expect(readRefreshAnswer({ status: 200, json: success })).toEqual({
      kind: "refreshed",
      accessToken: fakeAccessToken,
      expiresIn: 3599,
      grantedScopes: ["openid", gmail],
    });
  });

  it("keeps a new refresh token and a smaller scope list, so the host can store or act on them", () => {
    const meaning = readRefreshAnswer({
      status: 200,
      json: { ...success, refresh_token: fakeNewRefreshToken, scope: "openid" },
    });

    expect(meaning).toMatchObject({
      kind: "refreshed",
      refreshToken: fakeNewRefreshToken,
      grantedScopes: ["openid"],
    });
  });

  it("leaves out the refresh token and the scopes when Google didn't send them", () => {
    const { scope: _scope, ...withoutScope } = success;

    expect(readRefreshAnswer({ status: 200, json: withoutScope })).toEqual({
      kind: "refreshed",
      accessToken: fakeAccessToken,
      expiresIn: 3599,
    });
  });

  it("maps invalid_grant to signInRefused and invalid_client to clientRefused", () => {
    expect(readRefreshAnswer({ status: 400, json: { error: "invalid_grant" } })).toEqual({
      kind: "signInRefused",
    });
    expect(readRefreshAnswer({ status: 401, json: { error: "invalid_client" } })).toEqual({
      kind: "clientRefused",
    });
  });

  it("keeps any other error as Google's code with the status", () => {
    expect(readRefreshAnswer({ status: 400, json: { error: "unauthorized_client" } })).toEqual({
      kind: "googleError",
      errorCode: "unauthorized_client",
      status: 400,
    });
    expect(readRefreshAnswer({ status: 503, json: {} })).toEqual({
      kind: "googleError",
      errorCode: "unrecognised",
      status: 503,
    });
  });

  it("gives unexpectedAnswer for a body that isn't a JSON object, or a success without an access token or lifetime", () => {
    const { access_token: _token, ...withoutAccessToken } = success;

    for (const json of [undefined, null, "<html>Error</html>", [success], 42]) {
      expect(readRefreshAnswer({ status: 502, json })).toEqual({
        kind: "unexpectedAnswer",
        status: 502,
      });
    }
    for (const json of [
      withoutAccessToken,
      { ...success, expires_in: 0 },
      { ...success, expires_in: "3599" },
    ]) {
      expect(readRefreshAnswer({ status: 200, json }).kind).toBe("unexpectedAnswer");
    }
  });

  it("never carries an error_description or error code that echoes the refresh token or the secret", () => {
    const echoes = [
      { error: "invalid_grant", error_description: `Bad token ${fakeRefreshToken}` },
      { error: "invalid_client", error_description: `client_secret=${fakeSecret}` },
      { error: `invalid_request ${fakeRefreshToken}`, error_description: fakeSecret },
    ];

    for (const json of echoes) {
      const meaning = JSON.stringify(readRefreshAnswer({ status: 400, json }));
      expect(meaning).not.toContain(fakeRefreshToken);
      expect(meaning).not.toContain(fakeSecret);
    }
  });
});
