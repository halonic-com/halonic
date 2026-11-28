import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { runsPlaceText } from "../place-words.ts";
import { placeNamed } from "../screen.ts";
import { keys } from "../webdriver.ts";
import { basicsText, buttonLabels } from "../words.ts";
import { switcherXpath } from "./demo-workspace.ts";
import { focusRingAfterPointer } from "./focus-ring.ts";

const ring = "0 0 0 2px rgb(0, 95, 204)";
/** How the wide window starts a failing note. */
const wide = "It ran in a 1280 × 800 window.";
const { welcomeTitle, welcomeLine, recent, demoFolder, demoTag } = basicsText;
const welcomeText = `${welcomeTitle.text} ${welcomeLine.text} Open folder ${recent.text} Acme ~/Documents/${demoFolder.text} ${demoTag.text} ${buttonLabels.openDemo.text}`;

/**
 * Welcome, where Open demo focuses the Inbox's title and marks the window as a click does, Tab
 * marks it as a key does, and Enter on Runs focuses that page's title, with `runsRing` its ring.
 */
function welcome(clickRing = "none", runsRing = ring): FakeStudio {
  const studio = fakeStudio(welcomeText);
  button(studio, "main", buttonLabels.openDemo.text, () => {
    studio.rootAttributes.set("data-input", "pointer");
    studio.focused = { tag: "H1", text: "Inbox", codeFocused: true, boxShadow: clickRing };
  });
  button(studio, "main", keys.shift);
  button(studio, "main", keys.tab, () => {
    studio.rootAttributes.set("data-input", "keyboard");
    studio.focused = { tag: "BUTTON", text: "New request", codeFocused: false, boxShadow: ring };
  });
  studio.onType.set(placeNamed(runsPlaceText.text), () => {
    studio.focused = { tag: "H1", text: "Runs", codeFocused: true, boxShadow: runsRing };
  });
  return studio;
}

verifies("studio-click-test.focus-ring-step", () => {
  it("passes when the title has no ring after the click and the next page's title has one after a key", async () => {
    const studio = welcome();
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toEqual({
      passed: true,
      note: 'Focus: H1 "Inbox".',
    });
    expect(studio.clicks).toEqual([buttonLabels.openDemo.text, keys.shift, keys.tab]);
    expect(studio.typed).toEqual([keys.enter]);
  });

  it("closes the demo still open from an earlier step first, in the wide window", async () => {
    const studio = welcome();
    const main = studio.windows.get("main");
    if (main !== undefined) main.text = "Support reply";
    button(studio, "main", switcherXpath);
    button(studio, "main", buttonLabels.closeWorkspace.text, () => {
      if (main !== undefined) main.text = welcomeText;
    });
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toMatchObject({
      passed: true,
    });
    expect(studio.clicks.slice(0, 3)).toEqual([
      switcherXpath,
      buttonLabels.closeWorkspace.text,
      buttonLabels.openDemo.text,
    ]);
    expect(studio.resizes[0]).toEqual({ width: 1280, height: 800 });
  });

  it("fails as RING_AFTER_POINTER when the title shows a ring after the click", async () => {
    const studio = welcome(ring);
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
      note: `${wide} Focus is on the page, not on a page title code focused.`,
    });
  });

  it("fails as NO_CODE_FOCUS when the focus is on Welcome's start line, not a page title", async () => {
    const studio = welcome();
    button(studio, "main", buttonLabels.openDemo.text, () => {
      studio.rootAttributes.set("data-input", "pointer");
      studio.focused = { tag: "P", text: "Start here", codeFocused: true, boxShadow: "none" };
    });
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toMatchObject({
      passed: false,
      code: "NO_CODE_FOCUS",
    });
  });

  it("fails as NOT_MARKED_POINTER when the click leaves the window unmarked", async () => {
    const studio = welcome();
    button(studio, "main", buttonLabels.openDemo.text, () => {
      studio.focused = { tag: "H1", text: "Inbox", codeFocused: true, boxShadow: "none" };
    });
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toEqual({
      passed: false,
      code: "NOT_MARKED_POINTER",
      note: `${wide} After the click the window is marked data-input=(none), not pointer.`,
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

  it("fails as NO_RING_AFTER_KEY when the title a key brought shows no ring", async () => {
    const studio = welcome("none", "none");
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toEqual({
      passed: false,
      code: "NO_RING_AFTER_KEY",
      note: `${wide} H1 "Runs" took focus after a key but shows no ring (box-shadow none).`,
    });
  });

  it("fails as NO_RING_AFTER_KEY when Enter on Runs focuses no page title", async () => {
    const studio = welcome();
    studio.onType.clear();
    await expect(focusRingAfterPointer.run(studio.context)).resolves.toMatchObject({
      passed: false,
      code: "NO_RING_AFTER_KEY",
    });
  });
});
