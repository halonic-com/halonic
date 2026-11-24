// @vitest-environment jsdom
import type { ItemRef, ShownInWindow, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fakeHost, sendMessage, show, unmount } from "../test-support.tsx";
import { AssistantPanel } from "./assistant-panel.tsx";

afterEach(unmount);

const r42 = { kind: "run", hub: "support", id: "r42" };
const r99 = { kind: "run", hub: "support", id: "r99" };

/** The panel in a desktop window whose `showItem` knows `r42` and opens it in a tab. */
async function panelInWindow(showItem?: (item: ItemRef) => ShownInWindow) {
  const fake = fakeHost();
  const services = { get: () => fake.host, find: () => fake.host };
  const context = { services, announcer: { announce: vi.fn() }, showItem };
  const page = await show(
    <AssistantPanel
      context={context as unknown as WorkspaceContext}
      title="Assistant"
      onClose={() => {}}
    />,
  );
  await sendMessage(page, "Show me r42");
  return { fake, page, showTool: fake.requests[0]?.show };
}

const windowShowing = () =>
  vi.fn(
    (item: ItemRef): ShownInWindow =>
      item.id === "r42" ? { placed: "tab", name: "r42" } : { placed: "unknown" },
  );

const chips = (page: HTMLElement) =>
  [...page.querySelectorAll('[role="group"] > span > button:first-of-type')].map(
    (chip) => chip.textContent,
  );

verifies("assistant.build.show-tool", () => {
  it("shows the item in the window, adds it to the chat's shown items once, and keeps the focus", async () => {
    const showItem = windowShowing();
    const { page, showTool } = await panelInWindow(showItem);
    const box = page.querySelector("textarea");
    act(() => box?.focus());
    expect(await act(() => showTool?.(r42))).toBe("shown");
    expect(await act(() => showTool?.(r42))).toBe("shown");
    expect(showItem).toHaveBeenCalledWith(r42);
    expect(chips(page)).toEqual(["r42"]);
    expect(document.activeElement).toBe(box);
  });

  it("says the window doesn't know an item, and adds no chip for it", async () => {
    const { page, showTool } = await panelInWindow(windowShowing());
    expect(await act(() => showTool?.(r99))).toBe("unknown");
    expect(chips(page)).toEqual([]);
  });

  it("gives the model no way to show items in a window without showItem", async () => {
    const { showTool } = await panelInWindow();
    expect(showTool).toBeUndefined();
  });

  it("says Showed run r42 for the call in the transcript", async () => {
    const { fake, page } = await panelInWindow(windowShowing());
    const call = { id: "s1", name: "show", arguments: r42 };
    const result = "Showed run r42 in the main view, next to the chat.";
    await fake.finish({
      end: { reason: "answered" },
      messages: [
        { role: "assistant", content: "", toolCalls: [call] },
        { role: "tool", toolCallId: "s1", name: "show", content: result },
        { role: "assistant", content: "It's open next to the chat." },
      ],
    } as never);
    expect(page.textContent).toContain("Showed run r42");
    expect(page.textContent).not.toContain("Used show");
  });
});
