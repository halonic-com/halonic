// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { button, polyfillModals } from "../test-support/modal.ts";
import { byText, openChat, openMessenger, press } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

beforeEach(polyfillModals);
afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Acme's agents, one chat each; each message a minute after the last, so the last is newest. */
function acme(names: readonly string[]) {
  let minute = 0;
  const messaging = new FakeAgentMessaging({
    now: () => new Date(Date.UTC(2026, 10, 28, 9, minute++)),
  });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  for (const name of names) {
    const agent = messaging.addAgent(source.id, { name });
    const chat = messaging.addConversation(agent.id);
    messaging.addMessage(chat.id, { body: `${name} here.` });
  }
  return messaging;
}

/** The names on the list's rows, top to bottom. */
function rowNames(page: HTMLElement): string[] {
  return [...page.querySelectorAll("nav li")].map(
    (row) => row.querySelector("bdi")?.textContent ?? "",
  );
}

/** Picks an entry in the open chat's ··· menu. */
async function chatMenu(page: HTMLElement, name: string, entry: string): Promise<void> {
  await press(button(`More actions for ${name}`, page.querySelector("main header") ?? page));
  await press(byText(page, "[role=menuitem]", entry));
}

verifies("messenger.pinned-chats", () => {
  it("lists a pinned chat first, under Pinned, ahead of a newer chat", async () => {
    const page = await openMessenger(acme(["Chief", "Mara"]));
    expect(rowNames(page)).toEqual(["Mara", "Chief"]);
    await openChat(page, "Chief");
    await chatMenu(page, "Chief", "Pin chat");

    expect(rowNames(page)).toEqual(["Chief", "Mara"]);
    const pinned = page.querySelector("[data-pinned-chats]");
    expect(pinned?.querySelector("h3")?.textContent).toBe("Pinned");
    expect(pinned?.querySelector("ul")?.getAttribute("aria-label")).toBe("Pinned");
    expect(pinned?.textContent).toContain("Chief");
  });

  it("keeps three pins and says so when a fourth is pinned", async () => {
    const page = await openMessenger(acme(["Chief", "Mara", "Kim", "Leo"]));
    for (const name of ["Chief", "Mara", "Kim"]) {
      await openChat(page, name);
      await chatMenu(page, name, "Pin chat");
    }
    expect(page.textContent).not.toContain("You can pin up to 3 chats.");
    await openChat(page, "Leo");
    await chatMenu(page, "Leo", "Pin chat");

    expect(byText(page, "nav [role=status]", "You can pin up to 3 chats.")).toBeDefined();
    expect(rowNames(page)).toEqual(["Kim", "Mara", "Chief", "Leo"]);
    expect(page.querySelector("[data-pinned-chats]")?.textContent).not.toContain("Leo");
  });

  it("unpins a chat from its ··· menu, which puts it back by its newest message", async () => {
    const page = await openMessenger(acme(["Chief", "Mara"]));
    await openChat(page, "Chief");
    await chatMenu(page, "Chief", "Pin chat");
    await chatMenu(page, "Chief", "Unpin chat");

    expect(page.querySelector("[data-pinned-chats]")).toBeNull();
    expect(rowNames(page)).toEqual(["Mara", "Chief"]);
  });

  it("keeps the pins on this device, so the Messenger opens with them", async () => {
    const messaging = acme(["Chief", "Mara"]);
    const first = await openMessenger(messaging);
    await openChat(first, "Chief");
    await chatMenu(first, "Chief", "Pin chat");
    unmountAll();

    const again = await openMessenger(messaging);
    expect(rowNames(again)).toEqual(["Chief", "Mara"]);
  });
});
