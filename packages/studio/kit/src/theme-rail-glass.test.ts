import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { themeTokens } from "./test/theme-colours.spec.ts";
import { lightDarkPair } from "./test/theme-file.spec.ts";

verifies("kit.rail-glass-token", () => {
  describe("theme.css, the selected rail drawing's glass", () => {
    it("keeps --color-rail-glass the icons' deep blue glass in light and dark", () => {
      expect(lightDarkPair(themeTokens.get("--color-rail-glass") ?? "")).toEqual({
        light: "#0a1630",
        dark: "#0a1630",
      });
    });
  });
});
