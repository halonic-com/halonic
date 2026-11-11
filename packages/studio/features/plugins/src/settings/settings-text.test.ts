import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { secretNotSavedLine, settingNotSavedLine, settingProblemLine } from "./settings-text.ts";

verifies("plugins.plugin-settings", () => {
  describe("settingProblemLine", () => {
    it("makes a message a sentence", () => {
      expect(settingProblemLine("use a number")).toBe("Use a number.");
    });

    it("keeps a message that already ends a sentence", () => {
      expect(settingProblemLine("The keychain is locked.")).toBe("The keychain is locked.");
      expect(settingProblemLine("Is the disk full?")).toBe("Is the disk full?");
    });
  });

  describe("settingNotSavedLine", () => {
    it("names the setting, then gives the reason as a sentence", () => {
      expect(settingNotSavedLine("Alerts", "the disk is full")).toBe(
        "Couldn't save Alerts. The disk is full.",
      );
    });

    it("adds no second full stop to a reason that has one", () => {
      expect(settingNotSavedLine("Alerts", "The disk is full.")).toBe(
        "Couldn't save Alerts. The disk is full.",
      );
    });
  });

  describe("secretNotSavedLine", () => {
    it("adds no second full stop to a reason that has one", () => {
      expect(secretNotSavedLine("The keychain is locked.", false)).toBe(
        "Couldn't save the secret. The keychain is locked.",
      );
    });

    it("says the old secret is still in use when one was stored", () => {
      expect(secretNotSavedLine("the keychain is locked", true)).toBe(
        "Couldn't save the secret. The keychain is locked. The one you saved before is still in use.",
      );
    });
  });
});
