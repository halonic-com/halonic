// @vitest-environment jsdom
import type { ItemViewProps, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatAgent, ShownItem } from "../api.ts";
import { buildChatsOf } from "../chat/build-chats.ts";
import { chatTabItem } from "../chat/chat-tab-item.ts";
import { showInChat } from "../chat/show-in-chat.ts";
import { AssistantPanel } from "../panel/assistant-panel.tsx";
import {
  buttonNamed,
  chatOf,
  fakeHost,
  installFakePopover,
  sendMessage,
  show,
  unmount,
} from "../test-support.tsx";
import { ChatTabPage } from "./chat-tab-page.tsx";

let restorePopover = () => {};
beforeEach(() => {
  restorePopover = installFakePopover();
  // jsdom has no ResizeObserver; the item page only needs to observe.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  unmount();
  restorePopover();
});

const routine = chatOf("c1", [{ role: "user", content: "Add a routine" }], "Add a routine");
const triage: ShownItem = { item: { kind: "workflow", hub: "acme", id: "triage" }, name: "triage" };

function contextOf(fake: ReturnType<typeof fakeHost>, active?: string) {
  const services = { get: () => fake.host, find: () => fake.host };
  return {
    services,
    announcer: { announce: vi.fn() },
    openItem: vi.fn(),
    panelWindow: { isOpen: () => false, show: vi.fn(), hide: () => {}, toggle: () => {} },
    activeItem: {
      get: () => (active === undefined ? null : chatTabItem(active)),
      subscribe: () => () => {},
    },
  } as unknown as WorkspaceContext & {
    readonly openItem: ReturnType<typeof vi.fn>;
    readonly panelWindow: { readonly show: ReturnType<typeof vi.fn> };
  };
}

function tab(context: WorkspaceContext, chatId: string) {
  const props = { item: chatTabItem(chatId), context, Sections: () => null } as ItemViewProps;
  return <ChatTabPage {...props} />;
}

const agent: ChatAgent = {
  kind: "agent:support/triage",
  name: "Triage",
  description: "Sorts incoming mail by topic",
  model: "smart",
};

/** The menu items under the chip whose text starts with `chip`. */
function chipItems(page: HTMLElement, chip: string) {
  const trigger = [...page.querySelectorAll("button")].find((button) =>
    button.textContent?.startsWith(chip),
  );
  const menu = document.getElementById(trigger?.getAttribute("popovertarget") ?? "");
  return [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
}

const sidePanel = (page: HTMLElement) => page.querySelector<HTMLElement>('[role="tabpanel"]');

verifies("assistant.chat.open-as-tab", () => {
  it("moves the panel's chat to a tab and closes the panel", async () => {
    const fake = fakeHost([routine]);
    const context = contextOf(fake);
    const onClose = vi.fn();
    const page = await show(
      <AssistantPanel context={context} title="Assistant" onClose={onClose} />,
    );
    await act(async () => buttonNamed(page, "Open as tab")?.click());
    expect(context.openItem).toHaveBeenCalledWith(chatTabItem("c1"));
    expect(onClose).toHaveBeenCalled();
    const chats = buildChatsOf(fake.host);
    expect(chats.inTab("c1")).toBe(true);
    expect(chats.shown().kind).toBe("none");
  });

  it("shows the chat with its shown items, and Continue in the side panel moves it back", async () => {
    const fake = fakeHost([routine]);
    const chats = buildChatsOf(fake.host);
    await chats.open();
    chats.addShown("c1", triage);
    chats.moveToTab("c1");
    const context = contextOf(fake);
    const page = await show(tab(context, "c1"));
    expect(page.querySelector("h1")?.textContent).toContain("Add a routine");
    expect(page.querySelector("[data-chat-message]")?.textContent).toContain("Add a routine");
    expect(sidePanel(page)?.textContent).toContain("triage");
    await act(async () => buttonNamed(page, "Continue in the side panel")?.click());
    expect(chats.inTab("c1")).toBe(false);
    expect(context.panelWindow.show).toHaveBeenCalled();
    const shown = chats.shown();
    expect(shown.kind === "chat" && shown.view.shown).toEqual([triage]);
  });

  it("says what the side panel is for while nothing is shown", async () => {
    const fake = fakeHost([routine]);
    const page = await show(tab(contextOf(fake), "c1"));
    expect(sidePanel(page)?.parentElement?.hidden).toBe(true);
    await act(async () => buttonNamed(page, "Items")?.click());
    expect(sidePanel(page)?.parentElement?.hidden).toBe(false);
    expect(sidePanel(page)?.textContent).toBe(
      "Items the assistant shows or changes appear here.Alt+click an agent or workflow in the sidebar to show it.",
    );
  });

  it("puts Show in chat in the active tab's chat, and opens its side panel", async () => {
    const fake = fakeHost([routine]);
    const context = contextOf(fake, "c1");
    const page = await show(tab(context, "c1"));
    await act(async () => showInChat.show(triage, context));
    expect(buildChatsOf(fake.host).viewOf("c1")?.shown).toEqual([triage]);
    expect(sidePanel(page)?.parentElement?.hidden).toBe(false);
    expect(context.panelWindow.show).not.toHaveBeenCalled();
  });

  it("switches to a chat's tab when the panel's chat menu picks it", async () => {
    const alias = chatOf("c2", [{ role: "user", content: "Fix the alias" }], "Fix the alias");
    const fake = fakeHost([routine, alias]);
    buildChatsOf(fake.host).moveToTab("c2");
    const context = contextOf(fake);
    const page = await show(
      <AssistantPanel context={context} title="Assistant" onClose={() => {}} />,
    );
    const row = [...page.querySelectorAll<HTMLElement>("[role^=menuitem]")].find((each) =>
      each.textContent?.includes("Fix the alias"),
    );
    await act(async () => row?.click());
    expect(context.openItem).toHaveBeenCalledWith(chatTabItem("c2"));
  });

  it("opens Chat with's new chat in a tab of its own, and keeps this one", async () => {
    const fake = fakeHost([routine], { agents: [agent] });
    const context = contextOf(fake);
    const page = await show(tab(context, "c1"));
    await act(async () => chipItems(page, "Chat with:")[1]?.click());
    const next = fake.kept().find((chat) => chat.kind === agent.kind);
    expect(next).toBeDefined();
    expect(context.openItem).toHaveBeenCalledWith(chatTabItem(next?.id ?? ""));
    const chats = buildChatsOf(fake.host);
    expect(chats.inTab(next?.id ?? "")).toBe(true);
    expect(chats.inTab("c1")).toBe(true);
  });

  it("says why Chat with couldn't start a chat", async () => {
    const fake = fakeHost([routine], { agents: [agent] });
    fake.host.newChat = () => Promise.reject(new Error("The workspace is closed."));
    const context = contextOf(fake);
    const page = await show(tab(context, "c1"));
    await act(async () => chipItems(page, "Chat with:")[1]?.click());
    expect(context.announcer.announce).toHaveBeenCalledWith(
      "The workspace is closed.",
      "assertive",
    );
    expect(context.openItem).not.toHaveBeenCalled();
  });

  it("closes the tab when the chat is deleted, and the panel opens on another chat", async () => {
    const alias = chatOf("c2", [{ role: "user", content: "Fix the alias" }], "Fix the alias");
    const fake = fakeHost([routine, alias]);
    const chats = buildChatsOf(fake.host);
    chats.moveToTab("c1");
    await chats.open();
    const shown = chats.shown();
    expect(shown.kind === "chat" && shown.view.chat.id).toBe("c2");
    await chats.read("c1");
    await chats.deleteChat("c1");
    expect(chats.inTab("c1")).toBe(false);
  });
});

describe("the start screen", () => {
  verifies("assistant.start-screen.centered-input", () => {
    it("shows the heading and the box in the middle, then the transcript once sent", async () => {
      const fake = fakeHost();
      const draft = await fake.host.newChat("build");
      const page = await show(tab(contextOf(fake), draft.id));
      expect(page.querySelector("h2")?.textContent).toBe("What should we build?");
      expect(page.querySelector(".max-w-reading textarea")).not.toBeNull();
      expect(document.activeElement?.tagName).toBe("TEXTAREA");
      const box = page.querySelector("textarea");
      await sendMessage(page, "Add a routine");
      expect(page.querySelector("h2")).toBeNull();
      expect(page.querySelector("[data-chat-message]")?.textContent).toContain("Add a routine");
      // The box is the same element at the bottom, not a new one (UX checklist T14 1.12).
      expect(page.querySelector("textarea")).toBe(box);
      expect(document.activeElement).toBe(box);
      await fake.finish({ messages: [], end: { reason: "answered" } } as never);
    });
  });

  verifies("assistant.start-screen.halo", () => {
    it("draws the still halo behind it and the glow round the box, in a tab only", async () => {
      const fake = fakeHost();
      const draft = await fake.host.newChat("build");
      const page = await show(tab(contextOf(fake), draft.id));
      const halo = page.querySelector("[data-halo-spot]");
      expect(halo?.getAttribute("aria-hidden")).toBe("true");
      expect(halo?.className).toContain("bg-halo-spot");
      expect(halo?.className).toContain("pointer-events-none");
      expect(page.querySelector(".shadow-halo-glow textarea")).not.toBeNull();
      // The glow's corners follow the message box's 26px, so no sliver shows between (HAL-20776).
      expect(page.querySelector(".shadow-halo-glow")?.className).toContain("rounded-composer");
      await sendMessage(page, "Add a routine");
      expect(page.querySelector(".shadow-halo-glow")).toBeNull();
      const box = page.querySelector("textarea");
      const chips = [...page.querySelectorAll("button")].find((button) =>
        button.textContent?.startsWith("Model:"),
      );
      expect(chips !== undefined && box !== null).toBe(true);
      // After the first message the chips sit above the box again, as in the panel.
      expect(chips?.compareDocumentPosition(box as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      await fake.finish({ messages: [], end: { reason: "answered" } } as never);
      unmount();
      const panel = await show(
        <AssistantPanel context={contextOf(fake)} title="Assistant" onClose={() => {}} />,
      );
      expect(panel.querySelector("[data-halo-spot], .shadow-halo-glow")).toBeNull();
    });
  });
});
