import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeStudio } from "./fake-studio.test-helper.ts";
import { findMainWindow } from "./main-window.ts";

/** A fake Studio with these windows, in the driver's order, each still titled "Halonic". */
function studioWithWindows(handles: readonly string[]) {
  const studio = fakeStudio();
  studio.windows.clear();
  for (const handle of handles) studio.windows.set(handle, { text: "", buttons: new Map() });
  studio.title = "Halonic";
  return studio;
}

verifies("studio-click-test.main-window", () => {
  it("takes Studio's window when Inbox is listed first, though both are titled Halonic", async () => {
    const studio = studioWithWindows(["inbox", "main"]);
    const { driver, sleep } = studio.context;
    await expect(findMainWindow(driver, sleep)).resolves.toBe("main");
    expect(studio.current).toBe("main");
  });

  it("waits for Studio's window when only the focused apps are open yet", async () => {
    const studio = studioWithWindows(["messenger"]);
    const sleep = async () => {
      studio.windows.set("main", { text: "", buttons: new Map() });
    };
    await expect(findMainWindow(studio.context.driver, sleep)).resolves.toBe("main");
  });

  it("takes the first window when none is Studio's within 30 seconds", async () => {
    const studio = studioWithWindows(["messenger", "inbox"]);
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    await expect(findMainWindow(studio.context.driver, sleep)).resolves.toBe("messenger");
    expect(waits.reduce((total, ms) => total + ms, 0)).toBe(30_000);
    expect(studio.current).toBe("messenger");
  });
});
