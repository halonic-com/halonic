import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { drawRowFit, fakeStudio } from "../fake-studio.test-helper.ts";
import { inboxRowFit } from "./inbox-row-fit.ts";

/** An Acme row's title, meta line and badge. */
const parts = { title: "//li[1]//b", meta: "//li[1]//i", badge: "//li[1]//s" } as const;

verifies("studio-click-test.inbox-row-fit", () => {
  it("passes a two-line title, a one-line meta line and a 20px badge", async () => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts, { title: "40px" });
    await expect(inboxRowFit(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: true,
    });
  });

  it("fails as PLAIN_ROW_FIT when the title takes three lines, naming both heights", async () => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts, { title: "60px" });
    await expect(inboxRowFit(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: false,
      code: "PLAIN_ROW_FIT",
      note: "Acme's row: the title takes 60px and the meta line 20px, not at most 40px and 20px.",
    });
  });

  it("fails as PLAIN_ROW_FIT when the meta line wraps onto a second line", async () => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts, { meta: "40px" });
    await expect(inboxRowFit(studio.context, "Acme's row", parts)).resolves.toMatchObject({
      passed: false,
      code: "PLAIN_ROW_FIT",
    });
  });

  it("fails as AVATAR_BADGE_SIZE when the badge is the 28px tile's 16px", async () => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts, { badge: "16px" });
    await expect(inboxRowFit(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: false,
      code: "AVATAR_BADGE_SIZE",
      note: "Acme's row: the avatar's badge is 16px, not 20px.",
    });
  });

  it("fails as NO_AVATAR_BADGE when the avatar has no badge", async () => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts);
    studio.elements.delete(parts.badge);
    await expect(inboxRowFit(studio.context, "Acme's row", parts)).resolves.toMatchObject({
      passed: false,
      code: "NO_AVATAR_BADGE",
    });
  });
});
