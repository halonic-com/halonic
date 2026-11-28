import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import { demoWorkspace, switcherXpath } from "./steps/demo-workspace.ts";
import { wideWindow } from "./steps/wide-window.ts";
import {
  activeTabXpath,
  framedPanelXpath,
  frameXpath,
  tabXpath,
  windowTabs,
} from "./steps/window-tabs.ts";
import { keys } from "./webdriver.ts";
import { basicsText, buttonLabels } from "./words.ts";

const { recent, demoFolder, demoTag, openFolderRow } = basicsText;
const menu = `${recent.text.toUpperCase()} Acme ~/Documents/${demoFolder.text} ${demoTag.text} ${openFolderRow.text}`;

/** The demo in the app's 800 × 600 window, whose switcher opens the workspace menu. */
function studioOnDemo(): FakeStudio {
  const studio = fakeStudio("Support reply");
  studio.title = "Support reply · Acme · Halonic";
  button(studio, "main", switcherXpath, () => {
    const main = studio.windows.get("main");
    if (main !== undefined) main.text = menu;
  });
  button(studio, "main", keys.escape);
  return studio;
}

verifies("studio-click-test.wide-window", () => {
  it("runs a basics step in a 1280 × 800 window and gives the window its size back", async () => {
    const studio = fakeStudio("Home");
    const sizes: string[] = [];
    // The strip shows only while the window is wide, as in Studio.
    const tabs = () => (studio.windowSize.width >= 900 ? 1 : 0);
    studio.context.driver.count = async (xpath) => {
      sizes.push(`${studio.windowSize.width}`);
      return xpath === tabXpath ? tabs() + (studio.elements.get("opened") ?? 0) : 0;
    };
    studio.backgrounds.set(activeTabXpath, "rgb(255, 255, 255)");
    studio.backgrounds.set(framedPanelXpath, "rgb(255, 255, 255)");
    studio.backgrounds.set(frameXpath, "rgb(224, 234, 255)");
    const open = (count: number) => () => studio.elements.set("opened", count);
    button(studio, "main", buttonLabels.newTab.text, open(1));
    button(studio, "main", keys.escape);
    button(studio, "main", `${keys.control}+w`, open(0));
    button(studio, "main", `${keys.control}+${keys.shift}+t`, open(1));
    await expect(windowTabs.run(studio.context)).resolves.toEqual({ passed: true });
    expect(studio.resizes).toEqual([wideWindow, { width: 800, height: 600 }]);
    expect(new Set(sizes)).toEqual(new Set(["1280"]));
  });

  it("sizes Studio's main window when an earlier step left the session on another", async () => {
    const studio = studioOnDemo();
    studio.windows.set("messenger", { text: "Messenger", buttons: new Map() });
    studio.current = "messenger";
    const sizedWindows: string[] = [];
    const setWindowSize = studio.context.driver.setWindowSize;
    studio.context.driver.setWindowSize = async (size) => {
      sizedWindows.push(studio.current);
      return setWindowSize(size);
    };
    await expect(demoWorkspace.run(studio.context)).resolves.toEqual({ passed: true });
    expect(sizedWindows).toEqual(["main", "main"]);
  });

  it("names the size a failed step ran in", async () => {
    const studio = fakeStudio("Home");
    await expect(windowTabs.run(studio.context)).resolves.toMatchObject({
      passed: false,
      note: expect.stringMatching(/^It ran in a 1280 × 800 window\. /),
    });
  });

  it("names the size a step that threw ran in, and gives the window its size back", async () => {
    const studio = studioOnDemo();
    studio.context.driver.title = async () => {
      throw new Error("no such window");
    };
    await expect(demoWorkspace.run(studio.context)).rejects.toThrow(
      "It ran in a 1280 × 800 window. no such window",
    );
    expect(studio.windowSize).toEqual({ width: 800, height: 600 });
  });

  it("passes in the size the driver answers when a small screen caps it", async () => {
    const studio = studioOnDemo();
    const setWindowSize = studio.context.driver.setWindowSize;
    studio.context.driver.setWindowSize = async (size) => {
      await setWindowSize(size);
      return size.width === wideWindow.width ? { width: 1024, height: 768 } : size;
    };
    await expect(demoWorkspace.run(studio.context)).resolves.toEqual({ passed: true });
  });

  it("fails as NO_WIDE_WINDOW when the window can't be sized or stays narrow", async () => {
    const refused = studioOnDemo();
    refused.resizeRefusal = "unsupported operation";
    await expect(demoWorkspace.run(refused.context)).resolves.toEqual({
      passed: false,
      code: "NO_WIDE_WINDOW",
      note: "The window can't be sized (unsupported operation).",
    });
    expect(refused.clicks).toEqual([]);
    const narrow = studioOnDemo();
    narrow.context.driver.setWindowSize = async () => ({ width: 800, height: 600 });
    await expect(demoWorkspace.run(narrow.context)).resolves.toMatchObject({
      code: "NO_WIDE_WINDOW",
      note: "The window stayed 800 × 600, too narrow for the sidebar.",
    });
  });

  it("fails as WINDOW_NOT_RESTORED when a passed step can't give the size back", async () => {
    const studio = studioOnDemo();
    const setWindowSize = studio.context.driver.setWindowSize;
    studio.context.driver.setWindowSize = async (size) => {
      if (size.width !== wideWindow.width) throw new Error("no such window");
      return setWindowSize(size);
    };
    await expect(demoWorkspace.run(studio.context)).resolves.toEqual({
      passed: false,
      code: "WINDOW_NOT_RESTORED",
      note: "The window kept 1280 × 800 (no such window).",
    });
  });
});
