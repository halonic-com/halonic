// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createFromWelcome,
  holdOpens,
  menuRow,
  newWorkspaceHost,
  press,
  setUpWindow,
  shownHeading,
  start,
  switcherButton,
  tearDownWindow,
} from "./workspace-window.test-helper.tsx";

beforeEach(setUpWindow);
afterEach(tearDownWindow);

verifies("workspace.workspace-window", () => {
  beforeEach(() => {
    // jsdom has no popovers, which the menu closes itself with.
    HTMLElement.prototype.hidePopover ??= () => {};
  });

  it("moves focus to Home's title after the menu's Open a folder… (a11y W1)", async () => {
    const { switcher } = start(["/work/beta"]);
    await act(() => switcher.openLocation("/work/acme"));

    await act(async () => menuRow("Open a folder…")?.click());
    await act(async () => {});
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: beta");
    expect(document.activeElement).toBe(shownHeading());
  });

  it("moves focus to Home's title after New workspace… › Create (a11y W1, first run L13)", async () => {
    start([], [], undefined, [], newWorkspaceHost);
    const release = holdOpens();

    // The dialog closes and gives focus back to Welcome's New workspace… before the folder opens.
    await createFromWelcome("notes");
    await act(async () => release());
    await act(async () => {});
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: notes");
    expect(document.activeElement).toBe(shownHeading());
  });

  it("moves focus to the shown workspace's title on Ctrl 2 (a11y W1)", async () => {
    const { switcher } = start([]);
    await act(() => switcher.openLocation("/work/acme"));
    await act(() => switcher.openLocation("/work/beta"));
    await press({ key: "1", ctrlKey: true });
    switcherButton()?.focus();

    await press({ key: "2", ctrlKey: true });
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: beta");
    expect(document.activeElement).toBe(shownHeading());
  });

  it("moves focus to the title of the workspace left after Close workspace (a11y W1)", async () => {
    const { switcher } = start([]);
    await act(() => switcher.openLocation("/work/acme"));
    await act(() => switcher.openLocation("/work/beta"));

    await act(async () => menuRow("Close workspace")?.click());
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
    expect(document.activeElement).toBe(shownHeading());
  });

  it("leaves focus alone when a workspace is shown without the person asking", async () => {
    const { switcher } = start([]);

    // As the app's restore at start does: straight on the switcher, not through the window.
    await act(() => switcher.openLocation("/work/acme"));
    expect(document.activeElement).toBe(document.body);
  });
});
