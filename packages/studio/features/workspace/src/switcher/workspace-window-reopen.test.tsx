// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  element,
  holdOpens,
  setUpWindow,
  start,
  switcherButton,
  tearDownWindow,
} from "./workspace-window.test-helper.tsx";

beforeEach(setUpWindow);
afterEach(tearDownWindow);

/** Welcome's button that reads `text`; a kit button also holds its busy label, for its width. */
function button(text: string): HTMLButtonElement | undefined {
  return [...element.querySelectorAll("button")].find((each) => each.textContent?.includes(text));
}

/** The Recent row of the workspace named `name`. */
function recentRow(name: string): HTMLButtonElement | null {
  return element.querySelector<HTMLButtonElement>(`button[aria-label^="${name}, "]`);
}

verifies("workspace.reopen-gives-way", () => {
  it("shows the reopened row opening, and Open folder still opens the folder picked", async () => {
    const { switcher } = start(["/work/beta"]);
    switcher.recent.remember({ location: "/work/acme", name: "acme" });
    const release = holdOpens();
    let reopened: Promise<unknown> = Promise.resolve();

    act(() => {
      reopened = switcher.reopenOnStart("/work/acme");
    });
    expect(recentRow("acme")?.getAttribute("aria-busy")).toBe("true");

    await act(async () => button("Open folder")?.click());
    expect(recentRow("acme")?.getAttribute("aria-busy")).toBeNull();
    await act(async () => {
      release();
      await reopened;
    });

    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: beta");
    expect(switcher.open.find("/work/acme")).toBeUndefined();
  });
});
