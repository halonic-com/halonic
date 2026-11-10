import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildCss } from "../test/build-css.spec.ts";
import { TOAST_FADE_MS } from "./toast-card.tsx";

verifies("kit.toast", () => {
  it("is 360px wide on desktop and spans the phone's width less 16px, 8px above the bar", async () => {
    const css = await buildCss(["w-toast", "phone:left-4", "phone:bottom-2"]);
    expect(css).toContain("width: var(--container-toast)");
    expect(css).toContain("--container-toast: 360px");
    const phone = css.slice(css.indexOf("@media (width < 600px)"));
    expect(phone).toMatch(/\.phone\\:left-4\s*\{\s*left: calc\(var\(--spacing\) \* 4\)/);
    expect(phone).toMatch(/\.phone\\:bottom-2\s*\{\s*bottom: calc\(var\(--spacing\) \* 2\)/);
  });

  it("keeps a transparent 1px outline inside the box for forced colours", async () => {
    const css = await buildCss(["outline-1", "outline-transparent", "-outline-offset-1"]);
    expect(css).toContain("outline-width: 1px");
    expect(css).toContain("outline-color: transparent");
    expect(css).toContain("outline-offset: calc(1px * -1)");
  });

  it("centres the close on the title line, so a title-only toast stays 44px (T-D4)", async () => {
    const css = await buildCss(["-my-1", "touch:-mt-2.5", "touch:-mb-2.5", "phone:mb-0"]);
    expect(css).toContain("margin-block: calc(var(--spacing) * -1)");
    const touch = css.slice(css.indexOf("@media (pointer: coarse)"));
    expect(touch).toContain("margin-top: calc(var(--spacing) * -2.5)");
    expect(touch).toContain("margin-bottom: calc(var(--spacing) * -2.5)");
    // The phone keeps its 48px close as it was: no bottom margin, whatever the pointer.
    const phone = css.slice(css.indexOf("@media (width < 600px)"));
    expect(phone).toMatch(/\.phone\\:mb-0\s*\{\s*margin-bottom: 0px;/);
    expect(css.indexOf("@media (width < 600px)")).toBeGreaterThan(
      css.indexOf("@media (pointer: coarse)"),
    );
  });

  it("fades out in --duration-fast", () => {
    const theme = readFileSync(new URL("../theme.css", import.meta.url), "utf8");
    expect(theme).toContain(`--duration-fast: ${TOAST_FADE_MS}ms;`);
  });
});
