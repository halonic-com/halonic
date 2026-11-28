import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { plainVariables, themeTokens } from "./test/theme-colours.spec.ts";
import { lightDarkPair } from "./test/theme-file.spec.ts";

verifies("kit.rail-dot-tokens", () => {
  describe("theme.css, the rail's dot", () => {
    it("has the dot's and the ring's curves and times", () => {
      expect(themeTokens.get("--ease-dot")).toBe("cubic-bezier(0.25, 1, 0.5, 1)");
      expect(themeTokens.get("--ease-pulse-ring")).toBe("cubic-bezier(0.33, 1, 0.68, 1)");
      expect(plainVariables.get("--duration-dot-lead")).toBe("360ms");
      expect(plainVariables.get("--duration-dot-streak")).toBe("400ms");
      expect(plainVariables.get("--duration-dot-pulse-ring")).toBe("500ms");
      expect(plainVariables.get("--duration-rail-fade")).toBe("150ms");
    });

    it.each([
      ["--color-point-of-light", "#ffffff"],
      ["--color-rail-pulse", "#60a5fa"],
    ])("keeps %s the same in light and dark", (name, value) => {
      expect(lightDarkPair(themeTokens.get(name) ?? "")).toEqual({ light: value, dark: value });
    });

    it("gives the dot its glow", () => {
      expect(themeTokens.get("--shadow-point-of-light")).toContain("0 0 1.5px #fff");
    });
  });
});
