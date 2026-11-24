// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { reply } from "../page/page-fixtures.ts";
import { WorkflowScreen } from "../page/workflow-page.tsx";
import { listing, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { WorkflowsView } from "./workflows-page.tsx";

// jsdom has no popover: a menu closes itself after a pick by hiding it.
beforeAll(() => {
  HTMLElement.prototype.showPopover ??= () => {};
  HTMLElement.prototype.hidePopover ??= () => {};
});
afterEach(unmount);

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** Opens the ⋮ named for Support reply and gives its entries. */
function entriesOf(page: HTMLElement): HTMLElement[] {
  const label = "More actions for Support reply";
  act(() => page.querySelector<HTMLElement>(`button[aria-label="${label}"]`)?.click());
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

const support = listing("support", "reply", "Support reply");

verifies("assistant.chat.show-in-chat", () => {
  it("offers Show in chat in a row's ⋮, with the workflow", async () => {
    const showItem = vi.fn();
    const { host } = memoryHost([{ id: "support", name: "Support" }], [support]);
    const page = await show(
      <WorkflowsView host={host} showInChat={{ label: "Show in chat", show: showItem }} />,
    );
    await settled();
    const entries = entriesOf(page);
    expect(entries.map((entry) => entry.textContent)).toEqual(["Show in chat"]);
    act(() => entries[0]?.click());
    expect(showItem).toHaveBeenCalledWith(support);
  });

  it("has no row ⋮ without the Assistant, nor on a phone", async () => {
    const { host } = memoryHost([{ id: "support", name: "Support" }], [support]);
    const page = await show(
      <PresentationProvider presentation="phone">
        <WorkflowsView host={host} showInChat={{ label: "Show in chat", show: vi.fn() }} />
      </PresentationProvider>,
    );
    await settled();
    expect(page.querySelector('button[aria-label="More actions for Support reply"]')).toBeNull();
  });

  it("offers Show in chat first in the page's ⋮, with the workflow's name", async () => {
    const showItem = vi.fn();
    const workflow = listing("acme", "reply", "Support reply");
    const { host } = memoryHost([], [workflow], [reply], [], { trash: vi.fn() });
    const page = await show(
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        showInChat={{ label: "Show in chat", show: showItem }}
      />,
    );
    await settled();
    const entries = entriesOf(page);
    expect(entries.map((entry) => entry.textContent)).toEqual(["Show in chat", "Delete"]);
    act(() => entries[0]?.click());
    expect(showItem).toHaveBeenCalledWith("Support reply");
  });
});
