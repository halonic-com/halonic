import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { looksLikeGoogleClientSecret } from "./looks-like-google-client-secret.ts";

verifies("google-setup.looks-like-client-secret", () => {
  it("finds the GOCSPX- prefix anywhere in the text", () => {
    expect(looksLikeGoogleClientSecret("GOCSPX-abc123")).toBe(true);
    expect(looksLikeGoogleClientSecret("my secret is GOCSPX-abc123, keep it")).toBe(true);
    expect(looksLikeGoogleClientSecret("line one\nGOCSPX-a")).toBe(true);
  });

  it("ignores text without it", () => {
    expect(looksLikeGoogleClientSecret("")).toBe(false);
    expect(looksLikeGoogleClientSecret("1234-abc.apps.googleusercontent.com")).toBe(false);
    expect(looksLikeGoogleClientSecret("gocspx-abc123")).toBe(false);
  });

  it("ignores the bare prefix and the prefix inside a longer word", () => {
    expect(looksLikeGoogleClientSecret("secrets start with GOCSPX- in Google Cloud")).toBe(false);
    expect(looksLikeGoogleClientSecret("xGOCSPX-abc123")).toBe(false);
  });
});
