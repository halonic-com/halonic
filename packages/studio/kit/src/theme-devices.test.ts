import { describe, expect, it } from "vitest";
import { PHONE_MAX_WIDTH, WIDE_MIN_WIDTH } from "./index.ts";
import { css, plainVariables, themeTokens } from "./test/theme-colours.spec.ts";
import { blockBody } from "./test/theme-file.spec.ts";

// The phone, touch and older-engine rules of theme.css, apart from theme.test.ts's colours and
// scales so each file stays well under the size limit (HAL-18316).

describe("theme.css on a phone", () => {
  it("has a phone: variant below 600px and no phone breakpoint token", () => {
    expect(css).toContain("@custom-variant phone (@media (width < 600px));");
    expect(themeTokens.has("--breakpoint-phone")).toBe(false);
  });

  it("exports the same width the phone: variant uses", () => {
    const variantWidth = /@custom-variant phone \(@media \(width < (\d+)px\)\);/.exec(css)?.[1];
    expect(Number(variantWidth)).toBe(PHONE_MAX_WIDTH);
    expect(PHONE_MAX_WIDTH).toBe(600);
  });

  it("exports the same width the wide: breakpoint uses", () => {
    expect(themeTokens.get("--breakpoint-wide")).toBe(`${WIDE_MIN_WIDTH}px`);
    expect(WIDE_MIN_WIDTH).toBe(900);
  });

  it("keeps the touch sizes", () => {
    expect(themeTokens.get("--spacing-touch")).toBe("48px");
    expect(themeTokens.get("--spacing-phone-bar")).toBe("56px");
    expect(themeTokens.get("--spacing-nav-pill")).toBe("56px");
    expect(themeTokens.get("--spacing-qr-tile")).toBe("232px");
    expect(themeTokens.get("--text-input-touch")).toBe("16px");
    expect(themeTokens.get("--text-input-touch--line-height")).toBe("24px");
    expect(themeTokens.get("--text-input-touch--font-weight")).toBe("400");
  });

  it("sizes a short Input's text in characters, so it holds 6 at 14px and at a phone's 16px", () => {
    expect(themeTokens.get("--spacing-input-short")).toBe("6ch");
  });

  it("reads the safe areas once, and pads with the larger of 12px and the home bar", () => {
    expect(plainVariables.get("--safe-top")).toBe("env(safe-area-inset-top)");
    expect(plainVariables.get("--safe-bottom")).toBe("env(safe-area-inset-bottom)");
    expect(blockBody(css, "@utility pt-safe")).toContain("padding-top: var(--safe-top);");
    expect(blockBody(css, "@utility pb-safe")).toContain(
      "padding-bottom: max(12px, var(--safe-bottom));",
    );
    expect(blockBody(css, "@utility pb-safe-inset")).toContain(
      "padding-bottom: var(--safe-bottom);",
    );
  });
});

describe("theme.css on a touch screen", () => {
  it("has a touch: variant that follows the pointer, not the width", () => {
    expect(css).toContain("@custom-variant touch (@media (pointer: coarse));");
  });

  it("draws the 48px hit area outside the control, never smaller than the control", () => {
    const hitArea = blockBody(css, "@utility hit-touch");
    expect(hitArea).toContain("position: relative;");
    expect(blockBody(hitArea, "&::after")).toContain(
      "inset-block: min(0px, calc((100% - var(--spacing-touch)) / 2));",
    );
    expect(blockBody(hitArea, "&::after")).toContain(
      "inset-inline: min(0px, calc((100% - var(--spacing-touch)) / 2));",
    );
  });
});

describe("theme.css in older engines", () => {
  it("limits a TextArea in lines, with a px fallback from the line-height tokens before lh", () => {
    const utility = blockBody(css, "@utility max-h-rows");
    const fallback = "max-height: calc(var(--max-rows) * var(--text-body--line-height));";
    const inLines = "max-height: calc(var(--max-rows) * 1lh);";
    expect(utility.indexOf(fallback)).toBeGreaterThanOrEqual(0);
    expect(utility.indexOf(inLines)).toBeGreaterThan(utility.indexOf(fallback));
    for (const variant of ["@variant touch", "@variant phone"]) {
      expect(blockBody(utility, variant)).toContain(
        "max-height: calc(var(--max-rows) * var(--text-input-touch--line-height));",
      );
    }
    // The phone's block comes last, so it wins where both match.
    expect(utility.indexOf("@variant phone")).toBeGreaterThan(utility.indexOf("@variant touch"));
  });
});
