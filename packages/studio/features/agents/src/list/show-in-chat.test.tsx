// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryAgentsHost } from "../memory-host.ts";
import { showInChatEntry } from "../page/show-in-chat-entry.ts";
import { installFakePopover, show, unmount } from "../test-support.tsx";
import { AgentsView } from "./agents-page.tsx";

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmount();
  restorePopover();
});

const sorter = { hubId: "acme", id: "sorter", name: "Sorter" };

const entries = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];

verifies("assistant.chat.show-in-chat", () => {
  it("offers Show in chat in a row's ⋮ before Delete, with the agent", async () => {
    const showItem = vi.fn();
    const host = memoryAgentsHost({ hubs: [{ id: "acme", name: "acme" }], agents: [sorter] });
    const page = await show(
      <AgentsView host={host} showInChat={{ label: "Show in chat", show: showItem }} />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() =>
      page.querySelector<HTMLElement>('button[aria-label="More actions for Sorter"]')?.click(),
    );
    expect(entries().map((entry) => entry.textContent)).toEqual([
      "Open",
      "Open in new tab",
      "Show in chat",
      "Delete",
    ]);
    act(() => entries()[2]?.click());
    expect(showItem).toHaveBeenCalledWith(expect.objectContaining(sorter));
  });

  it("puts Show in chat first in the page's ⋮, but not on a phone nor without the Assistant", () => {
    const showItem = vi.fn();
    const [entry] = showInChatEntry({ label: "Show in chat", show: showItem }, "Sorter", false);
    expect(entry?.label).toBe("Show in chat");
    entry?.onSelect();
    expect(showItem).toHaveBeenCalledWith("Sorter");
    expect(showInChatEntry({ label: "Show in chat", show: showItem }, "Sorter", true)).toEqual([]);
    expect(showInChatEntry(undefined, "Sorter", false)).toEqual([]);
  });
});
