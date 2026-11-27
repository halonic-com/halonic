import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeStudio } from "./fake-studio.test-helper.ts";
import { findMainWindow } from "./main-window.ts";

/** A fake Studio whose windows, in the driver's order, carry these titles. */
function studioWithTitles(titles: Record<string, string>) {
  const studio = fakeStudio();
  studio.windows.clear();
  for (const handle of Object.keys(titles))
    studio.windows.set(handle, { text: "", buttons: new Map() });
  studio.context.driver.title = async () => titles[studio.current] ?? "";
  return studio;
}

verifies("studio-click-test.main-window", () => {
  it("takes Studio's window when Inbox is listed first", async () => {
    const studio = studioWithTitles({
      inbox: "Inbox · Halonic Inbox",
      main: "Home · Acme · Halonic",
    });
    const { driver, sleep } = studio.context;
    await expect(findMainWindow(driver, sleep)).resolves.toBe("main");
    expect(studio.current).toBe("main");
  });

  it("takes Studio's window before its page sets a title", async () => {
    const studio = studioWithTitles({ messenger: "Halonic Messenger", main: "Halonic" });
    const { driver, sleep } = studio.context;
    await expect(findMainWindow(driver, sleep)).resolves.toBe("main");
  });

  it("takes the first window when none is titled as Studio's", async () => {
    const studio = studioWithTitles({ messenger: "Halonic Messenger", inbox: "Halonic Inbox" });
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    await expect(findMainWindow(studio.context.driver, sleep)).resolves.toBe("messenger");
    expect(waits.reduce((total, ms) => total + ms, 0)).toBe(30_000);
    expect(studio.current).toBe("messenger");
  });
});
