import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { accountMatches } from "./account-match.ts";

verifies("google-setup.sign-in-account-match", () => {
  it("matches the same address with other spaces or letter case", () => {
    expect(accountMatches("Someone@Example.com ", "someone@example.com")).toBe(true);
    expect(accountMatches("someone@example.com", " SOMEONE@EXAMPLE.COM")).toBe(true);
  });

  it("refuses another address", () => {
    expect(accountMatches("someone@example.com", "other@example.com")).toBe(false);
    expect(accountMatches("someone@example.com", "someone@example.org")).toBe(false);
  });

  it("doesn't fold Gmail dots or a + suffix", () => {
    expect(accountMatches("someone@example.com", "some.one@example.com")).toBe(false);
    expect(accountMatches("someone@example.com", "someone+x@example.com")).toBe(false);
  });

  it("refuses an empty connector address, even against an empty one", () => {
    expect(accountMatches("", "")).toBe(false);
    expect(accountMatches("  ", "someone@example.com")).toBe(false);
  });
});
