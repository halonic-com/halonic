import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildCss } from "../test/build-css.spec.ts";

verifies("kit.dialog", () => {
  it("sizes the box from the dialog width tokens, inside the window's limit", async () => {
    const css = await buildCss(["w-dialog-sm", "w-dialog-md", "w-dialog-lg", "dialog-frame"]);
    expect(css).toContain("width: var(--container-dialog-sm)");
    expect(css).toContain("width: var(--container-dialog-md)");
    expect(css).toContain("width: var(--container-dialog-lg)");
    expect(css).toContain("--container-dialog-sm: 440px");
    expect(css).toContain("--container-dialog-md: 560px");
    expect(css).toContain("--container-dialog-lg: 720px");
    expect(css).toContain("max-width: calc(100vw - 32px)");
    expect(css).toContain("max-height: calc(100dvh - 64px)");
  });

  it("keeps a fixed height inside the same limit", async () => {
    const css = await buildCss(["dialog-height"]);
    expect(css).toContain("height: min(var(--dialog-height), calc(100dvh - 64px))");
  });

  it("scrolls the header with the body under 36em of window height", async () => {
    const css = await buildCss(["short:overflow-y-auto"]);
    expect(css).toMatch(
      /@media \(max-height: 36em\)\s*\{\s*\.short\\:overflow-y-auto\s*\{\s*overflow-y: auto/,
    );
  });

  it("fades the box and the overlay in from transparent", async () => {
    const css = await buildCss(["starting:opacity-0", "backdrop:starting:opacity-0"]);
    const starting = css.slice(css.indexOf("@starting-style"));
    expect(starting).toMatch(/\.starting\\:opacity-0\s*\{\s*opacity: 0%/);
    expect(starting).toMatch(/\.backdrop\\:starting\\:opacity-0::backdrop\s*\{\s*opacity: 0%/);
  });
});
