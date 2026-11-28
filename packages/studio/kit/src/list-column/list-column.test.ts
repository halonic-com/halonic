import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildCss } from "../test/build-css.spec.ts";
import { listColumnClass } from "./list-column.ts";

verifies("kit.list-column", () => {
  it("sizes the list column at 34%, at least 208px and at most 380px", async () => {
    const css = await buildCss(listColumnClass.split(" "));
    expect(css).toContain("width: 34%");
    expect(css).toContain("min-width: calc(var(--spacing) * 52)");
    expect(css).toContain("max-width: calc(var(--spacing) * 95)");
  });

  it("works out to 208px and 380px on the kit's 4px spacing", async () => {
    const css = await buildCss(listColumnClass.split(" "));
    expect(css).toContain("--spacing: 4px");
  });
});
