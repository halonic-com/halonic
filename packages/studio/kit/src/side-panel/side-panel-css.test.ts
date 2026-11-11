import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildCss } from "../test/build-css.spec.ts";

verifies("kit.side-panel", () => {
  it("builds the phone header from the phone top bar and the 48px desktop header", async () => {
    const css = await buildCss(["phone-top-bar", "h-12", "pr-2.5", "w-panel"]);
    expect(css).toContain("min-height: calc(var(--spacing-phone-bar) + var(--safe-top))");
    expect(css).toContain("height: calc(var(--spacing) * 12)");
    expect(css).toContain("padding-right: calc(var(--spacing) * 2.5)");
    expect(css).toContain("width: var(--spacing-panel)");
  });
});
