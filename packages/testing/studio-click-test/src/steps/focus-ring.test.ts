import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { keys } from "../webdriver.ts";
import { buttonLabels } from "../words.ts";
import { focusRingAfterPointer } from "./focus-ring.ts";

/** Welcome, where Open demo focuses the Inbox's title and marks the window as a click does. */
function welcome(ring = "none"): FakeStudio {
  const studio = fakeStudio(`Halonic Studio ${buttonLabels.openDemo.text}`);
  button(studio, "main", buttonLabels.openDemo.text, () => {
    studio.rootAttributes.set("data-input", "pointer");
    studio.focused = { tag: "H1", text: "Inbox", codeFocused: true, boxShadow: ring };
  });
  button(studio, "main", keys.shift);
  button(studio, "main", keys.tab, () => studio.rootAttributes.set("data-input", "keyboard"));
  return studio;
}

verifies("studio-click-test.focus-ring-step", () => {
  it("passes when the title has focus with no ring, Shift keeps the mark and Tab changes it", async () => {
    const studio = welcome();
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toEqual({
      passed: true,
      note: 'Focus: H1 "Inbox".',
    });
    expect(studio.clicks).toEqual([buttonLabels.openDemo.text, keys.shift, keys.tab]);
  });

  it("fails as RING_AFTER_POINTER when the title shows a ring after the click", async () => {
    const studio = welcome("0 0 0 2px rgb(0, 95, 204)");
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toMatchObject({
      passed: false,
      code: "RING_AFTER_POINTER",
    });
  });

  it("fails as NO_CODE_FOCUS when no title takes focus", async () => {
    const studio = welcome();
    button(studio, "main", buttonLabels.openDemo.text);
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toEqual({
      passed: false,
      code: "NO_CODE_FOCUS",
      note: "Focus is on the page, not on a title code focused.",
    });
  });

  it("fails as MODIFIER_MARKED_KEYBOARD when Shift alone marks the window", async () => {
    const studio = welcome();
    button(studio, "main", keys.shift, () => studio.rootAttributes.set("data-input", "keyboard"));
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toMatchObject({
      passed: false,
      code: "MODIFIER_MARKED_KEYBOARD",
    });
  });

  it("fails as NOT_MARKED_KEYBOARD when Tab leaves the pointer mark", async () => {
    const studio = welcome();
    button(studio, "main", keys.tab);
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toMatchObject({
      passed: false,
      code: "NOT_MARKED_KEYBOARD",
    });
  });
});
