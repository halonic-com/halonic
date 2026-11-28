import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { contrastRatio, parseColour } from "./test/contrast.ts";
import {
  colourToken,
  modeValue,
  moreContrast,
  plainVariables,
  themeTokens,
} from "./test/theme-colours.spec.ts";

/** The old divider's dark colour, which the header's line and the message box's edge keep. */
const darkDivider = "#1b2638";

verifies("kit.content-header", () => {
  it("draws the header's line under its shadow in dark only, and 3:1 under More contrast", () => {
    expect(themeTokens.get("--shadow-header")).toBe(
      "0 1px 0 0 var(--shade-header-line), 0 1px 4px 0 var(--shade-header)",
    );
    const line = plainVariables.get("--shade-header-line") ?? "";
    expect(modeValue(line, "light")).toBe("transparent");
    expect(modeValue(line, "dark")).toBe(darkDivider);
    expect(moreContrast.get("--shade-header-line")).toBe("var(--color-border-control)");
  });
});

verifies("kit.prompt-look", () => {
  it("gives the message box's edge the dark divider's colour, see-through in light", () => {
    const edge = themeTokens.get("--color-border-composer") ?? "";
    expect(modeValue(edge, "light")).toBe("transparent");
    expect(modeValue(edge, "dark")).toBe(darkDivider);
    // Noah's look check (HAL-20776): the fill alone is 1.08:1 on the dark panel, the edge 1.28:1.
    const panel = colourToken("surface", "dark");
    expect(contrastRatio(parseColour(darkDivider), panel)).toBeGreaterThan(
      contrastRatio(colourToken("surface-raised", "dark"), panel),
    );
  });
});
