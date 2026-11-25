import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import { closeWorkspace } from "./steps/close-workspace.ts";
import { demoWorkspace, switcherXpath } from "./steps/demo-workspace.ts";
import { tabXpath, windowTabs } from "./steps/window-tabs.ts";
import { clickTestSteps } from "./steps.ts";
import { keys } from "./webdriver.ts";
import { basicsText, buttonLabels } from "./words.ts";

const { recent, demoFolder, demoTag, openFolderRow, welcomeTitle, welcomeLine } = basicsText;
const demoRow = `${recent.text} Acme ~/Documents/${demoFolder.text} ${demoTag.text}`;

function setText(studio: FakeStudio, text: string) {
  const main = studio.windows.get("main");
  if (main !== undefined) main.text = text;
}

/** The demo open in the window, whose switcher opens a workspace menu showing `menu`. */
function studioOnDemo(menu: string): FakeStudio {
  const studio = fakeStudio("Support reply");
  studio.title = "Support reply · Acme · Halonic";
  button(studio, "main", switcherXpath, () => setText(studio, menu));
  button(studio, "main", keys.escape);
  return studio;
}

/** A tab strip with one tab, where each window key changes the count as `counts` says. */
function studioWithTabs(counts: { newTab: number; close: number; reopen: number }): FakeStudio {
  const studio = fakeStudio("Home");
  studio.elements.set(tabXpath, 1);
  const set = (count: number) => () => studio.elements.set(tabXpath, count);
  button(studio, "main", buttonLabels.newTab.text, set(counts.newTab));
  button(studio, "main", keys.escape);
  button(studio, "main", `${keys.control}+w`, set(counts.close));
  button(studio, "main", `${keys.control}+${keys.shift}+t`, set(counts.reopen));
  return studio;
}

verifies("studio-click-test.basics-steps", () => {
  it("come after the phase 1 steps, with Close workspace last", () => {
    expect(clickTestSteps.slice(3).map((step) => step.id)).toEqual([
      "demo-workspace",
      "window-tabs",
      "close-workspace",
    ]);
  });

  describe("the demo is the shown workspace", () => {
    it("passes on the window title and a menu with the demo's Demo row", async () => {
      const studio = studioOnDemo(`${demoRow} ${openFolderRow.text}`);
      await expect(demoWorkspace.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([switcherXpath, keys.escape]);
    });

    it("fails as WRONG_TITLE when the title doesn't name the workspace", async () => {
      const studio = studioOnDemo("");
      studio.title = "Support reply · Halonic";
      await expect(demoWorkspace.run(studio.context)).resolves.toMatchObject({
        code: "WRONG_TITLE",
        note: 'Window title: "Support reply · Halonic".',
      });
    });

    it("fails as MENU_INCOMPLETE, naming what the menu lacks", async () => {
      const studio = studioOnDemo(`${recent.text} Acme ${openFolderRow.text}`);
      const outcome = await demoWorkspace.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "MENU_INCOMPLETE" });
      expect(outcome.passed ? "" : outcome.note).toContain(
        `no "${demoFolder.text}", "${demoTag.text}".`,
      );
    });

    it("fails as NO_SWITCHER when no workspace switcher shows", async () => {
      const studio = fakeStudio("Support reply");
      studio.title = "Support reply · Acme · Halonic";
      await expect(demoWorkspace.run(studio.context)).resolves.toMatchObject({
        code: "NO_SWITCHER",
      });
    });
  });

  describe("the window tabs", () => {
    it("counts a tab more after New tab, one less after Ctrl W, and it back after Ctrl Shift T", async () => {
      const studio = studioWithTabs({ newTab: 2, close: 1, reopen: 2 });
      await expect(windowTabs.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([
        buttonLabels.newTab.text,
        keys.escape,
        `${keys.control}+w`,
        `${keys.control}+${keys.shift}+t`,
        `${keys.control}+w`,
      ]);
    });

    it("fails as TAB_NOT_CLOSED when Ctrl W leaves the tab", async () => {
      const studio = studioWithTabs({ newTab: 2, close: 2, reopen: 3 });
      await expect(windowTabs.run(studio.context)).resolves.toEqual({
        passed: false,
        code: "TAB_NOT_CLOSED",
        note: "Ctrl W: 2 tabs before, 2 after.",
      });
    });

    it("fails as TAB_NOT_OPENED or TAB_NOT_REOPENED when the count doesn't move", async () => {
      const notOpened = studioWithTabs({ newTab: 1, close: 1, reopen: 1 });
      await expect(windowTabs.run(notOpened.context)).resolves.toMatchObject({
        code: "TAB_NOT_OPENED",
      });
      const notReopened = studioWithTabs({ newTab: 2, close: 1, reopen: 1 });
      await expect(windowTabs.run(notReopened.context)).resolves.toMatchObject({
        code: "TAB_NOT_REOPENED",
      });
    });

    it("fails as NO_TABS without the strip, and NO_NEW_TAB_BUTTON without +", async () => {
      await expect(windowTabs.run(fakeStudio("Home").context)).resolves.toMatchObject({
        code: "NO_TABS",
      });
      const studio = fakeStudio("Home");
      studio.elements.set(tabXpath, 1);
      await expect(windowTabs.run(studio.context)).resolves.toMatchObject({
        code: "NO_NEW_TAB_BUTTON",
      });
    });
  });

  describe("Close workspace", () => {
    function studioToClose(welcome: string): FakeStudio {
      const studio = studioOnDemo("");
      button(studio, "main", buttonLabels.closeWorkspace.text, () => setText(studio, welcome));
      return studio;
    }
    const welcome = `${welcomeTitle.text} ${welcomeLine.text} Open folder ${demoRow} ${buttonLabels.openDemo.text}`;

    it("passes on Welcome with the demo under Recent and Open demo", async () => {
      const studio = studioToClose(welcome);
      await expect(closeWorkspace.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([switcherXpath, buttonLabels.closeWorkspace.text]);
    });

    it("fails as NO_WELCOME, naming what Welcome lacks", async () => {
      const studio = studioToClose(welcome.replace(demoTag.text, ""));
      const outcome = await closeWorkspace.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_WELCOME" });
      expect(outcome.passed ? "" : outcome.note).toContain(`no "${demoTag.text}".`);
    });

    it("fails as NO_CLOSE_WORKSPACE when the menu has no such row", async () => {
      await expect(closeWorkspace.run(studioOnDemo("").context)).resolves.toMatchObject({
        code: "NO_CLOSE_WORKSPACE",
      });
    });
  });
});
