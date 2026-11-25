// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { buildChatsOf } from "../chat/build-chats.ts";
import { AssistantPanel } from "../panel/assistant-panel.tsx";
import { chatOf, fakeHost, show, unmount } from "../test-support.tsx";
import { itemChat } from "./item-chat.tsx";

afterEach(unmount);

const summarize = { kind: "skill", hub: "acme", id: "summarize" } as const;
const triage = { kind: "workflow", hub: "acme", id: "triage" } as const;

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
  return context as unknown as WorkspaceContext;
}

const box = () => document.querySelector("textarea") as HTMLTextAreaElement;

function type(area: HTMLTextAreaElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, value);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

verifies("assistant.chat.describe", () => {
  it("opens the panel on a new Build chat about no item, with the text in the box, unsent", async () => {
    const fake = fakeHost();
    const context = windowOf(fake);
    const text = "Make a workflow called Invoice intake that ";
    await itemChat.describe(text, context);
    expect(context.panelWindow?.show).toHaveBeenCalledOnce();
    await show(<AssistantPanel context={context} title="Assistant" onClose={() => {}} />);
    expect(box().value).toBe(text);
    expect(document.activeElement).toBe(box());
    expect(box().selectionStart).toBe(text.length);
    expect(fake.requests).toEqual([]);
    const shown = buildChatsOf(fake.host).shown();
    expect(shown.kind === "chat" && shown.view.chat.about).toBeUndefined();
  });

  it("fills the box of a panel already open, reusing its empty draft", async () => {
    const fake = fakeHost();
    const context = windowOf(fake);
    await show(<AssistantPanel context={context} title="Assistant" onClose={() => {}} />);
    const before = (await fake.host.chats()).length;
    await act(() => itemChat.describe("Make a workflow that ", context));
    expect(box().value).toBe("Make a workflow that ");
    expect(document.activeElement).toBe(box());
    expect((await fake.host.chats()).length).toBe(before);
  });

  it("keeps text typed and not sent, putting its own after it in a new paragraph", async () => {
    const fake = fakeHost();
    const context = windowOf(fake);
    await show(<AssistantPanel context={context} title="Assistant" onClose={() => {}} />);
    type(box(), "Watch the inbox");
    await act(() => itemChat.describe("Make a workflow that ", context));
    expect(box().value).toBe("Watch the inbox\n\nMake a workflow that ");
    expect(box().selectionStart).toBe(box().value.length);
  });
});

verifies("assistant.chat.ask-about", () => {
  it("opens the panel on a new Build chat about the item, with focus in the box", async () => {
    const fake = fakeHost();
    const context = windowOf(fake);
    await itemChat.askAbout(summarize, "Summarize", context);
    expect(context.panelWindow?.show).toHaveBeenCalledOnce();
    await show(<AssistantPanel context={context} title="Assistant" onClose={() => {}} />);
    const shown = buildChatsOf(fake.host).shown();
    expect(shown.kind === "chat" && shown.view.chat.about).toEqual(summarize);
    expect(box().value).toBe("");
    expect(document.activeElement).toBe(box());
    expect(shown.kind === "chat" && shown.view.shown).toEqual([
      { item: summarize, name: "Summarize" },
    ]);
  });

  it("shows the item's kept chat on the left of its page, and the panel doesn't open on it", async () => {
    const kept = { ...chatOf("c1", [{ role: "user", content: "Add a step" }], "Add a step") };
    const fake = fakeHost([
      { ...kept, about: triage },
      chatOf("c2", [{ role: "user", content: "Hi" }], "Hi"),
    ]);
    const context = windowOf(fake);
    const page = await show(itemChat.chatFor(triage, "Triage", context).render(() => {}, false));
    await act(async () => {});
    expect(page.textContent).toContain("Add a step");
    expect(buildChatsOf(fake.host).inTab("c1")).toBe(true);
  });

  it("starts a new draft about the item when it has no chat", async () => {
    const fake = fakeHost([chatOf("c1", [{ role: "user", content: "Hi" }], "Hi")]);
    const context = windowOf(fake);
    await show(itemChat.chatFor(triage, "Triage", context).render(() => {}, false));
    await act(async () => {});
    const draft = (await fake.host.newChat("build", triage)).id;
    expect(buildChatsOf(fake.host).inTab(draft)).toBe(true);
  });

  it("doesn't read the chat again when the page is drawn with a new object for the same item", async () => {
    const fake = fakeHost();
    const context = windowOf(fake);
    const chats = vi.spyOn(fake.host, "chats");
    const page = (about: typeof triage) =>
      itemChat.chatFor(about, "Triage", context).render(() => {}, false);
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(page(triage)));
    const reads = chats.mock.calls.length;
    // One read finds the item's chat, and one fills its chat menu (flow-assistant 2.4).
    expect(reads).toBe(2);
    await act(async () => root.render(page({ ...triage })));
    expect(chats.mock.calls.length).toBe(reads);
    act(() => root.unmount());
  });
});

verifies("assistant.chat.ask-about-placeholder", () => {
  it("gives the box the item-page chat's placeholder with the item's name", async () => {
    const context = windowOf(fakeHost());
    await itemChat.askAbout(summarize, "Summarize", context);
    await show(<AssistantPanel context={context} title="Assistant" onClose={() => {}} />);
    expect(box().placeholder).toBe("What should change in Summarize?");
  });

  it("keeps the box's own placeholder in a chat about no item", async () => {
    const context = windowOf(fakeHost());
    await itemChat.describe("Make a workflow that ", context);
    await show(<AssistantPanel context={context} title="Assistant" onClose={() => {}} />);
    expect(box().placeholder).toBe("Ask for a change…");
  });
});
