import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { isAuthorEmail, isAuthorName, isIdentityComplete } from "./identity.ts";

verifies("source-control.identity", () => {
  describe("isAuthorName", () => {
    it("takes one line of text", () => {
      expect(isAuthorName("Sam Smith")).toBe(true);
    });

    it("refuses an empty name, a name git would read as an option and a name over several lines", () => {
      expect(isAuthorName("")).toBe(false);
      expect(isAuthorName("   ")).toBe(false);
      expect(isAuthorName("-x")).toBe(false);
      expect(isAuthorName("Sam\nSmith")).toBe(false);
      expect(isAuthorName("a".repeat(255))).toBe(false);
    });
  });

  describe("isAuthorEmail", () => {
    it("takes something, an at sign and something", () => {
      expect(isAuthorEmail("sam@acme.example")).toBe(true);
    });

    it("refuses an empty text, no at sign, spaces and a leading dash", () => {
      expect(isAuthorEmail("")).toBe(false);
      expect(isAuthorEmail("sam")).toBe(false);
      expect(isAuthorEmail("sam @acme.example")).toBe(false);
      expect(isAuthorEmail("@acme.example")).toBe(false);
      expect(isAuthorEmail("-sam@acme.example")).toBe(false);
    });
  });

  describe("isIdentityComplete", () => {
    it("needs both a name and an email", () => {
      expect(isIdentityComplete({ name: "Sam", email: "sam@acme.example" })).toBe(true);
      expect(isIdentityComplete({ name: "", email: "sam@acme.example" })).toBe(false);
      expect(isIdentityComplete({ name: "Sam", email: " " })).toBe(false);
    });
  });
});
