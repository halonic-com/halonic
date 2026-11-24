// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { showInChat } from "../chat/show-in-chat.ts";
import { buttonNamed, chatOf, fakeHost, sendMessage, show, unmount } from "../test-support.tsx";
import { AssistantPanel } from "./assistant-panel.tsx";

afterEach(unmount);

const shownOf = (kind: string, id: string, name = id) => ({
  item: { kind, hub: "acme", id },
  name,
});
const triage = shownOf("workflow", "triage");
const sorter = shownOf("agent", "sorter", "Sorter");

/** A window's context with a panel that starts closed, as the shell gives it. */
function windowOf(fake: ReturnType<typeof fakeHost>) {
  let open = false;
  const services = { get: () => fake.host, find: () => fake.host };
  const context = {
    services,
    announcer: { announce: vi.fn() },
    openItem: vi.fn(),
    panelWindow: {
      isOpen: () => open,
      show: vi.fn(() => (open = true)),
      hide: () => (open = false),
      toggle: () => (open = !open),
    },
  };
  return context as unknown as WorkspaceContext & { openItem: ReturnType<typeof vi.fn> };
}

const chips = (page: HTMLElement) =>
  [...page.querySelectorAll('[role="group"] > span > button:first-of-type')].map(
    (chip) => chip.textContent,
  );

verifies("assistant.chat.show-in-chat", () => {
  it("opens a closed panel on a new Build chat with the item, leaving focus where it was", async () => {
    const fake = fakeHost([chatOf("c1", [{ role: "user", content: "Old" }], "Old")]);
    const context = windowOf(fake);
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    await showInChat.show(sorter, context);
    expect(context.panelWindow?.show).toHaveBeenCalledOnce();
    const page = await show(
      <AssistantPanel context={context} title="Assistant" onClose={() => {}} />,
    );
    expect(page.querySelector("h3")?.textContent).toBe("What should we build?");
    expect(chips(page)).toEqual(["Sorter"]);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("adds an item once, and adds to the chat an open panel shows", async () => {
    const fake = fakeHost();
    const context = windowOf(fake);
    const page = await show(
      <AssistantPanel context={context} title="Assistant" onClose={() => {}} />,
    );
    await act(() => showInChat.show(triage, context));
    await act(() => showInChat.show(triage, context));
    await act(() => showInChat.show(sorter, context));
    expect(chips(page)).toEqual(["triage", "Sorter"]);
    expect(page.textContent).toContain("Shown:");
  });

  it("tells the model the items shown with each message, and not one removed", async () => {
    const fake = fakeHost();
    const context = windowOf(fake);
    const page = await show(
      <AssistantPanel context={context} title="Assistant" onClose={() => {}} />,
    );
    await act(() => showInChat.show(triage, context));
    await sendMessage(page, "Add a step");
    expect(fake.requests[0]?.shown).toEqual([triage]);
    await fake.finish({ end: { reason: "answered" }, messages: [] } as never);
    await act(async () => buttonNamed(page, "Remove triage from this chat")?.click());
    expect(chips(page)).toEqual([]);
    expect(page.textContent).not.toContain("Shown:");
    await sendMessage(page, "Thanks");
    expect(fake.requests[1]?.shown).toEqual([]);
  });

  it("shows three chips, then +1 with a menu of the rest; a name opens its item", async () => {
    const fake = fakeHost();
    const context = windowOf(fake);
    const page = await show(
      <AssistantPanel context={context} title="Assistant" onClose={() => {}} />,
    );
    for (const id of ["one", "two", "three", "four"]) {
      await act(() => showInChat.show(shownOf("workflow", id), context));
    }
    expect(chips(page)).toEqual(["one", "two", "three"]);
    const more = buttonNamed(page, "+1");
    expect(more).toBeDefined();
    // The chat menu in the header has its own items, so look only inside the +1 menu.
    const moreItems = more?.parentElement?.querySelectorAll('[role="menuitem"]') ?? [];
    expect([...moreItems].map((item) => item.textContent)).toEqual(["four"]);
    await act(async () => buttonNamed(page, "two")?.click());
    expect(context.openItem).toHaveBeenCalledWith({ kind: "workflow", hub: "acme", id: "two" });
  });
});
