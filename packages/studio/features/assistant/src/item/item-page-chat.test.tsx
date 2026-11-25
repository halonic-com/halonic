// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildChatsOf } from "../chat/build-chats.ts";
import { chatTabItem } from "../chat/chat-tab-item.ts";
import { chatOf, fakeHost, installFakePopover, show, unmount } from "../test-support.tsx";
import { itemChat } from "./item-chat.tsx";

let restorePopover = () => {};
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmount();
  restorePopover();
});

const triage = { kind: "workflow", hub: "acme", id: "triage" } as const;
const aboutTriage = {
  ...chatOf("c1", [{ role: "user", content: "Add a step" }], "Add a step"),
  about: triage,
};
const aboutNothing = chatOf("c2", [{ role: "user", content: "Hi" }], "Say hi");

/** A window's context with tabs, as the shell gives a page. */
function contextOf(fake: ReturnType<typeof fakeHost>): WorkspaceContext {
  const services = { get: () => fake.host, find: () => fake.host };
  return {
    services,
    announcer: { announce: vi.fn() },
    openItem: vi.fn(),
  } as unknown as WorkspaceContext;
}

/** The chat on the left of the page of workflow "Triage", once it has read its chat. */
async function triagePage(fake: ReturnType<typeof fakeHost>, context = contextOf(fake)) {
  const page = await show(itemChat.chatFor(triage, "Triage", context).render(() => {}, false));
  await act(async () => {});
  return page;
}

/** The entries of the menu the button named `name` opens. */
async function openMenu(page: HTMLElement, name: string): Promise<HTMLElement[]> {
  const button = [...page.querySelectorAll<HTMLButtonElement>("button")].find(
    (each) => (each.getAttribute("aria-label") ?? each.textContent) === name,
  );
  await act(async () => button?.click());
  return [...page.querySelectorAll<HTMLElement>("[role^=menuitem]")];
}

verifies("assistant.chat.item-page", () => {
  it("is a Build chat about the item: About: Triage, What should change in Triage?, and no Chat with chip", async () => {
    const page = await triagePage(fakeHost([aboutNothing]));
    expect(page.textContent).toContain("About: Triage");
    expect(page.querySelector("h3")?.textContent).toBe("What should change in Triage?");
    expect(page.textContent).toContain(
      "I make changes in your files and mark them; you accept or reject each one.",
    );
    expect(page.textContent).toContain("Model:");
    expect(page.textContent).not.toContain("Chat with:");
  });

  it("lists only the chats about the item in its menu, and a pick changes the chat the page shows", async () => {
    const other = {
      ...chatOf("c3", [{ role: "user", content: "Rename" }], "Rename it"),
      about: triage,
    };
    const page = await triagePage(fakeHost([aboutTriage, aboutNothing, other]));
    expect(page.textContent).toContain("Add a step");

    const rows = await openMenu(page, "Add a step");
    const labels = rows.map((row) => row.textContent ?? "");
    expect(labels.some((label) => label.includes("Rename it"))).toBe(true);
    expect(labels.some((label) => label.includes("Say hi"))).toBe(false);

    await act(async () => rows.find((row) => row.textContent?.includes("Rename it"))?.click());
    await act(async () => {});
    // The chat menu's button names the chat the page shows.
    expect(page.querySelector("button[aria-haspopup=menu]")?.textContent).toBe("Rename it");
    // Focus goes to the box, as a pick in the panel's menu puts it (HAL-18315, AS9).
    expect(document.activeElement).toBe(page.querySelector("textarea"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Message the assistant");
  });

  it("puts focus in the new chat's box after New chat", async () => {
    const page = await triagePage(fakeHost([aboutTriage]));
    const rows = await openMenu(page, "Add a step");
    await act(async () => rows.find((row) => row.textContent === "New chat")?.click());
    await act(async () => {});
    expect(page.querySelector("h3")?.textContent).toBe("What should change in Triage?");
    expect(document.activeElement).toBe(page.querySelector("textarea"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Message the assistant");
  });

  it("opens a kept chat as a tab from its ⋮, and the page shows a new chat about the item", async () => {
    const fake = fakeHost([aboutTriage]);
    const context = contextOf(fake);
    const page = await triagePage(fake, context);

    const entries = await openMenu(page, "More actions for Add a step");
    await act(async () => entries.find((entry) => entry.textContent === "Open as tab")?.click());
    await act(async () => {});

    expect(context.openItem).toHaveBeenCalledWith(chatTabItem("c1"));
    expect(page.querySelector("h3")?.textContent).toBe("What should change in Triage?");
    const draft = (await fake.host.newChat("build", triage)).id;
    expect(draft).not.toBe("c1");
    expect(buildChatsOf(fake.host).inTab(draft)).toBe(true);
  });
});
