// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { show, unmount } from "../test-support.tsx";
import { daily, hostReading, screenOf } from "./page.test-helper.tsx";

afterEach(unmount);

const scheduleTab = (page: HTMLElement) =>
  [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((tab) =>
    tab.textContent?.startsWith("Schedule"),
  );

verifies("routines.starts.starts-card", () => {
  it("counts the missing input on the Schedule tab while the engine refuses the start", async () => {
    const refused = await show(
      screenOf(hostReading(() => ({ ...daily, inputMissing: true })).host),
    );

    // What stops a start is counted on the Schedule tab (flow-routines 3.6, RT2 of HAL-15304).
    expect(scheduleTab(refused)?.textContent).toContain("1 error");
    unmount();

    const fine = await show(screenOf(hostReading(() => daily).host));
    expect(scheduleTab(fine)?.textContent).not.toContain("error");
  });
});
