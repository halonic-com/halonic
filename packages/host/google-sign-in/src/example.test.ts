import { expect, it } from "vitest";
import { runExample } from "../examples/start-sign-in.ts";

it("the README example runs and gives the results its comments promise", async () => {
  expect(await runExample()).toEqual([
    "https://accounts.google.com/o/oauth2/v2/auth",
    "  response_type: code",
    "  client_id: 123456789-acme.apps.example.test",
    "  redirect_uri: http://127.0.0.1:8787/google/callback",
    "  scope: email https://www.googleapis.com/auth/gmail.readonly openid",
    "  state: <43 random characters>",
    "  code_challenge: <43 random characters>",
    "  code_challenge_method: S256",
    "  access_type: offline",
    "  prompt: consent",
    "  login_hint: clerk@acme.example",
    "callback with the URL's state: accepted",
    "callback with another state: refused",
    "callback with no state: refused",
  ]);
});
