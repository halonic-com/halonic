import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ChangesList } from "./changes-list.ts";
import { isAuthorEmail, isAuthorName, isIdentityComplete } from "./identity.ts";
import { fakeSource, settle } from "./source.test-helper.ts";

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

    it("counts bytes, as the shell does, not letters", () => {
      expect(isAuthorName("é".repeat(127))).toBe(true);
      expect(isAuthorName("é".repeat(128))).toBe(false);
    });

    it("refuses control characters in the range U+0080 to U+009F", () => {
      expect(isAuthorName("Sam\u0085Smith")).toBe(false);
      expect(isAuthorName("Sam\u009fSmith")).toBe(false);
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

  describe("ChangesList reading who versions are from", () => {
    it("reads it once it is set, not on every refresh", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const list = new ChangesList(fake.source);
      await settle();
      fake.wake();
      await settle();
      expect(fake.identityReads()).toBe(1);
      list.dispose();
    });

    it("keeps reading it while a part is not set", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setIdentity({ name: "", email: "" });
      const list = new ChangesList(fake.source);
      await settle();
      fake.wake();
      await settle();
      expect(fake.identityReads()).toBe(2);
      list.dispose();
    });
  });
});
