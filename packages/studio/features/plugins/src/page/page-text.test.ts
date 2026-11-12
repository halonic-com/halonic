import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { originText, trustedDay } from "./page-text.ts";

verifies("plugins.plugin-page", () => {
  describe("originText", () => {
    it("leaves out the scheme and .git", () => {
      expect(
        originText({
          kind: "git",
          address: "https://github.com/example/halonic-weather.git",
          commit: "3f9c2a1",
        }),
      ).toBe("github.com/example/halonic-weather");
    });

    it("never shows a user and token typed into the address", () => {
      // Joined here, as the leak guard's own tests do, so the made-up token isn't read as a real one.
      const address = ["https://me", "fake-token@github.com/example/halonic-weather.git"].join(":");
      const shown = originText({ kind: "git", address, commit: "3f9c2a1" });

      expect(shown).toBe("github.com/example/halonic-weather");
      expect(shown).not.toContain("fake-token");
    });

    it("leaves out a user alone, and keeps an @ in the path", () => {
      expect(
        originText({ kind: "git", address: "ssh://git@example.com/team/@weather", commit: "1" }),
      ).toBe("example.com/team/@weather");
    });

    it("shows a folder's path as it was given", () => {
      expect(originText({ kind: "folder", path: "~/plugins/weather" })).toBe("~/plugins/weather");
    });
  });

  describe("trustedDay", () => {
    const now = new Date(2026, 10, 12);

    it("says the day in the same time zone as now", () => {
      expect(trustedDay(new Date(2026, 10, 3, 0, 30).toISOString(), now)).toBe("3 Nov");
      expect(trustedDay(new Date(2026, 10, 3, 23, 30).toISOString(), now)).toBe("3 Nov");
    });

    it("adds the year when it isn't this year's", () => {
      expect(trustedDay(new Date(2025, 0, 9, 12).toISOString(), now)).toBe("9 Jan 2025");
    });

    it("leaves out a date that isn't a time", () => {
      expect(trustedDay("soon", now)).toBeUndefined();
      expect(trustedDay(undefined, now)).toBeUndefined();
    });
  });
});
