import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { drawRowFit, fakeStudio } from "../fake-studio.test-helper.ts";
import { inboxRowFit } from "./inbox-row-fit.ts";

/** An Acme row's title, meta line and badge. */
const parts = { title: "//li[1]//b", meta: "//li[1]//i", badge: "//li[1]//s" } as const;

verifies("studio-click-test.inbox-row-fit", () => {
  it("passes a title clamped to two 20px lines, a meta line cut on one and a 20px badge", async () => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts);
    await expect(inboxRowFit(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: true,
    });
  });

  it("fails as PLAIN_ROW_FIT when the title isn't clamped, however short it is", async () => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts, { titleClamp: "none", titleLineHeight: "24px" });
    await expect(inboxRowFit(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: false,
      code: "PLAIN_ROW_FIT",
      note: "Acme's row: the title is clamped to none lines of 24px, not 2 of 20px.",
    });
  });

  it("fails as PLAIN_ROW_FIT when the meta line may wrap", async () => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts, { metaWhiteSpace: "normal", metaOverflow: "clip" });
    await expect(inboxRowFit(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: false,
      code: "PLAIN_ROW_FIT",
      note: "Acme's row: the meta line has white-space normal and text-overflow clip, not nowrap and ellipsis.",
    });
  });

  it("reads the cut on the text before a meta line's whole end", async () => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts, { metaWhiteSpace: "normal", metaOverflow: "clip" });
    studio.elements.set(`${parts.meta}/*[@data-part='meta-end']`, 1);
    studio.styles.set(`${parts.meta}/*[1] white-space`, "nowrap");
    studio.styles.set(`${parts.meta}/*[1] text-overflow`, "ellipsis");
    await expect(inboxRowFit(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: true,
    });
  });

  it.each([
    ["title", parts.title],
    ["meta line", parts.meta],
  ])("fails as NO_ROW_PART when the row has no %s", async (name, xpath) => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts);
    studio.elements.delete(xpath);
    await expect(inboxRowFit(studio.context, "Acme's row", parts)).resolves.toEqual({
      passed: false,
      code: "NO_ROW_PART",
      note: `Acme's row: no ${name} at ${xpath}.`,
    });
  });

  it("fails as AVATAR_BADGE_SIZE when the badge is the 28px tile's 16px", async () => {
    const studio = fakeStudio("Acme");
    drawRowFit(studio, parts, { badgeHeight: "16px" });
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
