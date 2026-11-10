import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildCss } from "../test/build-css.spec.ts";

verifies("kit.side-panel", () => {
  it("builds the phone header from the phone bar token and the 48px desktop header", async () => {
    const css = await buildCss(["min-h-phone-bar", "min-h-12", "w-panel"]);
    expect(css).toContain("min-height: var(--spacing-phone-bar)");
    expect(css).toContain("min-height: calc(var(--spacing) * 12)");
    expect(css).toContain("width: var(--spacing-panel)");
  });
});
