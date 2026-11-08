import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type AuthUrlInput, googleAuthUrl, signInScopes } from "./auth-url.ts";

const gmail = "https://www.googleapis.com/auth/gmail.readonly";
const drive = "https://www.googleapis.com/auth/drive.file";

const input: AuthUrlInput = {
  clientId: "fake-client.apps.googleusercontent.example",
  redirect: { port: 8787, path: "/google/callback" },
  state: "fake-state",
  codeChallenge: "fake-challenge",
  scopes: [gmail],
};

const parameters = (url: string) => new URL(url).searchParams;

verifies("google-setup.sign-in-auth-url", () => {
  it("asks for the code flow with PKCE S256, a loopback redirect and a refresh token", () => {
    const url = googleAuthUrl(input);
    const query = parameters(url);

    expect(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
    expect(Object.fromEntries(query)).toEqual({
      response_type: "code",
      client_id: input.clientId,
      redirect_uri: "http://127.0.0.1:8787/google/callback",
      scope: `email ${gmail} openid`,
      state: "fake-state",
      code_challenge: "fake-challenge",
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });
    expect(query.has("include_granted_scopes")).toBe(false);
  });

  it("adds openid and email to the services' scopes, sorted and without duplicates", () => {
    expect(signInScopes([gmail, drive, gmail, "email"])).toEqual(["email", drive, gmail, "openid"]);
    expect(signInScopes([])).toEqual(["email", "openid"]);
  });

  it("refuses a scope that is empty or holds whitespace", () => {
    expect(() => signInScopes([""])).toThrow(RangeError);
    expect(() => signInScopes([`${gmail} ${drive}`])).toThrow("holds whitespace");
  });

  it("sets login_hint to the e-mail when it is known, and leaves it out otherwise", () => {
    const hinted = parameters(googleAuthUrl({ ...input, loginHint: "account@example.com" }));

    expect(hinted.get("login_hint")).toBe("account@example.com");
    expect(parameters(googleAuthUrl(input)).has("login_hint")).toBe(false);
    expect(parameters(googleAuthUrl({ ...input, loginHint: "" })).has("login_hint")).toBe(false);
  });

  it("encodes every value, so none can add a parameter", () => {
    const query = parameters(
      googleAuthUrl({ ...input, state: "a&prompt=none", loginHint: "a+b@example.com" }),
    );

    expect(query.get("state")).toBe("a&prompt=none");
    expect(query.get("login_hint")).toBe("a+b@example.com");
    expect(query.getAll("prompt")).toEqual(["consent"]);
  });

  it("refuses a login_hint that isn't well-formed text with a RangeError", () => {
    const loneSurrogate = "account\ud800@example.com";

    expect(() => googleAuthUrl({ ...input, loginHint: loneSurrogate })).toThrow(
      "The auth URL's login_hint is not well-formed text.",
    );
  });

  it("refuses an empty client ID, state or challenge, and a bad redirect", () => {
    expect(() => googleAuthUrl({ ...input, clientId: "" })).toThrow("needs a client ID");
    expect(() => googleAuthUrl({ ...input, state: "" })).toThrow("needs a state");
    expect(() => googleAuthUrl({ ...input, codeChallenge: "" })).toThrow("needs a code challenge");
    expect(() => googleAuthUrl({ ...input, redirect: { port: 8787, path: "/cb?x=1" } })).toThrow(
      RangeError,
    );
  });
});
