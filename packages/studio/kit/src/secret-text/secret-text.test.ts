import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { SecretText } from "./secret-text.ts";

const value = "fake-secret-value";

verifies("kit.copy-button-no-secrets", () => {
  it("gives the value only through reveal()", () => {
    expect(new SecretText(value).reveal()).toBe(value);
  });

  it("shows [secret] when it's turned into text by accident", () => {
    const secret = new SecretText(value);
    expect(String(secret)).toBe("[secret]");
    expect(`${secret}`).toBe("[secret]");
    expect(JSON.stringify({ secret })).toBe('{"secret":"[secret]"}');
  });

  it("keeps the value out of its own properties", () => {
    const secret = new SecretText(value);
    expect(Object.values(secret)).not.toContain(value);
    expect(JSON.stringify(Object.entries(secret))).not.toContain(value);
  });

  it("says whether anything was typed", () => {
    expect(new SecretText("").isEmpty).toBe(true);
    expect(new SecretText(value).isEmpty).toBe(false);
  });
});
