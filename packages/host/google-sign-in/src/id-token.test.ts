import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeClient, fakeEmail, fakeIdToken, testStart } from "./fake-google.test-helper.ts";
import { readIdTokenAccount } from "./id-token.ts";

const now = new Date(testStart);
const read = (idToken: string) => readIdTokenAccount(idToken, fakeClient.clientId, now);
const encoded = (text: string) => Buffer.from(text).toString("base64url");

verifies("google-sign-in.id-token", () => {
  it("reads the e-mail and subject from a token Google issued for our client", () => {
    expect(read(fakeIdToken())).toEqual({ email: fakeEmail, subject: "100000000000000000001" });
    expect(read(fakeIdToken({ iss: "accounts.google.com" }))?.email).toBe(fakeEmail);
    expect(read(fakeIdToken({ aud: [fakeClient.clientId] }))?.email).toBe(fakeEmail);
  });

  it("refuses another issuer or another audience", () => {
    expect(read(fakeIdToken({ iss: "https://accounts.example.com" }))).toBeUndefined();
    expect(read(fakeIdToken({ iss: undefined }))).toBeUndefined();
    expect(read(fakeIdToken({ aud: "other-client.apps.example.com" }))).toBeUndefined();
    expect(read(fakeIdToken({ aud: [fakeClient.clientId, "other-client"] }))).toBeUndefined();
    expect(read(fakeIdToken({ aud: [] }))).toBeUndefined();
  });

  it("refuses an expired token", () => {
    expect(read(fakeIdToken({ exp: testStart / 1000 }))).toBeUndefined();
    expect(read(fakeIdToken({ exp: String(testStart / 1000 + 3600) }))).toBeUndefined();
  });

  it("refuses an e-mail Google hasn't verified, and a missing e-mail or subject", () => {
    expect(read(fakeIdToken({ email_verified: false }))).toBeUndefined();
    expect(read(fakeIdToken({ email_verified: "true" }))).toBeUndefined();
    expect(read(fakeIdToken({ email: "" }))).toBeUndefined();
    expect(read(fakeIdToken({ sub: undefined }))).toBeUndefined();
  });

  it("refuses a malformed token without saying what was in it", () => {
    expect(read("")).toBeUndefined();
    expect(read("one.two")).toBeUndefined();
    expect(read("a.not base64.c")).toBeUndefined();
    expect(read(`a.${encoded("not json")}.c`)).toBeUndefined();
    expect(read(`a.${encoded("[1, 2]")}.c`)).toBeUndefined();
  });
});
