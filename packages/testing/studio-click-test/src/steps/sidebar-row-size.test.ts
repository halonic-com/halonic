import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { drawRow, fakeStudio } from "../fake-studio.test-helper.ts";
import { sidebarRowSize } from "./plain-row-size.ts";

/** An Acme row and its picture's place. */
const parts = { row: "//li[1]", picture: "//li[1]//img" } as const;

verifies("studio-click-test.sidebar-row-size", () => {
  it("passes an 80px row with a 60px picture", async () => {
    const studio = fakeStudio("Acme");
    drawRow(studio, parts);
    studio.elements.set(parts.picture, 1);
    await expect(sidebarRowSize(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: true,
    });
  });

  it("fails as SIDEBAR_ROW_SIZE when the row is taller, naming both heights", async () => {
    const studio = fakeStudio("Acme");
    drawRow(studio, parts, "96px");
    studio.elements.set(parts.picture, 1);
    await expect(sidebarRowSize(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: false,
      code: "SIDEBAR_ROW_SIZE",
      note: "Acme's row: the row is 96px high and its picture 60px, not 80px and 60px.",
    });
  });

  it("fails as NO_SIDEBAR_ROW when the list doesn't hold the row", async () => {
    const studio = fakeStudio("Acme");
    await expect(sidebarRowSize(studio.context, "Acme's row", parts)).resolves.toMatchObject({
      passed: false,
      code: "NO_SIDEBAR_ROW",
    });
  });

  it("reads only the row when it shows initials, without reading the missing picture", async () => {
    const studio = fakeStudio("Acme");
    drawRow(studio, parts, "80px", "999px");
    await expect(sidebarRowSize(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: true,
    });
  });
});
