// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Messenger } from "../messenger.ts";
import { button, openDialog, polyfillModals } from "../test-support/modal.ts";
import { byText, openChat, openMessenger, press, pressKey, typeIn } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";
import { isGoneFrom } from "./use-chat-pins.tsx";

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

/** Acme's chats with Chief, Kim and Mara, then the Design channel with Chief and Kim, newest. */
function acmeWithChannel() {
  let minute = 0;
  const messaging = new FakeAgentMessaging({
    now: () => new Date(Date.UTC(2026, 10, 28, 9, minute++)),
  });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const agents = ["Chief", "Kim", "Mara"].map((name) => {
    const agent = messaging.addAgent(source.id, { name });
    const chat = messaging.addConversation(agent.id);
    messaging.addMessage(chat.id, { body: `${name} here.` });
    return agent;
  });
  const members = agents.slice(0, 2).map((agent) => agent.id);
  const design = messaging.addConversation(members[0] ?? "", { title: "Design", members });
  messaging.addMessage(design.id, { body: "Mockups are up." });
  return messaging;
}

/** Leaves the channel whose row holds `name`, through its header and the dialog. */
async function leaveChannel(page: HTMLElement, name: string): Promise<void> {
  await openChat(page, name);
  await press(byText(page, "header button", "Leave channel"));
  await press(button("Leave", openDialog() ?? document));
}

/** What the page's own status region last read out. */
function pageSaid(page: HTMLElement): string | null | undefined {
  return page.querySelector("[data-page-status]")?.textContent;
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

    expect(byText(page, "nav p", "You can pin up to 3 chats.")).toBeDefined();
    expect(pageSaid(page)).toContain("You can pin up to 3 chats.");
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

  it("lets a new pin take the place of a pinned channel the board left", async () => {
    const page = await openMessenger(acmeWithChannel());
    for (const name of ["Design", "Chief", "Kim"]) {
      await openChat(page, name);
      await chatMenu(page, name, "Pin chat");
    }
    await leaveChannel(page, "Design");
    await openChat(page, "Mara");
    await chatMenu(page, "Mara", "Pin chat");

    expect(page.textContent).not.toContain("You can pin up to 3 chats.");
    expect(rowNames(page).slice(0, 3)).toEqual(["Mara", "Kim", "Chief"]);
  });

  it("after Leave, focuses the row that took the channel's place in the order shown", async () => {
    const page = await openMessenger(acmeWithChannel());
    await openChat(page, "Mara");
    await chatMenu(page, "Mara", "Pin chat");
    // Mara pinned, then Design, Kim, Chief by newest message.
    expect(rowNames(page)).toEqual(["Mara", "Design", "Kim", "Chief"]);
    await leaveChannel(page, "Design");

    expect(rowNames(page)).toEqual(["Mara", "Kim", "Chief"]);
    expect(document.activeElement).toBe(byText(page, "nav li > button", "Kim"));
  });

  it("drops the note at the next unpin, and reads it out on every full try", async () => {
    const page = await openMessenger(acme(["Chief", "Mara", "Kim", "Leo"]));
    for (const name of ["Chief", "Mara", "Kim"]) {
      await openChat(page, name);
      await chatMenu(page, name, "Pin chat");
    }
    await openChat(page, "Leo");
    await chatMenu(page, "Leo", "Pin chat");
    const first = page.querySelector("[data-page-status] span:last-child");
    await chatMenu(page, "Leo", "Pin chat");
    const second = page.querySelector("[data-page-status] span:last-child");
    expect(second?.textContent).toBe("You can pin up to 3 chats.");
    expect(second).not.toBe(first);

    await openChat(page, "Kim");
    await chatMenu(page, "Kim", "Unpin chat");
    expect(page.querySelector("nav")?.textContent).not.toContain("You can pin up to 3 chats.");
    expect(pageSaid(page)).not.toContain("You can pin up to 3 chats.");
  });

  it("says the note in a toast in one pane, where the chat takes the list's place", async () => {
    const page = await openMessenger(acme(["Chief", "Mara", "Kim", "Leo"]), [], true);
    for (const name of ["Chief", "Mara", "Kim"]) {
      await openChat(page, name);
      await chatMenu(page, name, "Pin chat");
      await press(byText(page, "main button", "Back to chats"));
    }
    expect(document.body.textContent).not.toContain("You can pin up to 3 chats.");
    await openChat(page, "Leo");
    await chatMenu(page, "Leo", "Pin chat");

    const toast = byText(
      document.body as HTMLElement,
      "[data-toast], [role=status], li",
      "You can pin up to 3 chats.",
    );
    expect(toast).toBeDefined();
    // The toast says it; the page's status doesn't read it a second time.
    expect(pageSaid(page)).not.toContain("You can pin up to 3 chats.");
    await press(byText(page, "main button", "Back to chats"));
    expect(byText(page, "nav p", "You can pin up to 3 chats.")).toBeDefined();
    // The toast said it; the list coming back doesn't read it again.
    expect(pageSaid(page)).not.toContain("You can pin up to 3 chats.");
  });

  it("puts Pin chat first in the ··· menu, before Mark as unread", async () => {
    const page = await openMessenger(acme(["Chief"]));
    await openChat(page, "Chief");
    await press(button("More actions for Chief", page.querySelector("main header") ?? page));
    const menu = byText(page, "[role=menuitem]", "Pin chat")?.closest("[role=menu]");
    const entries = [...(menu?.querySelectorAll("[role=menuitem]") ?? [])].map(
      (entry) => entry.textContent,
    );
    expect(entries).toEqual(["Pin chat", "Mark as unread"]);
  });

  it("ends the Pinned group with a line, as the Needs you entry ends", async () => {
    const page = await openMessenger(acme(["Chief", "Mara"]));
    await openChat(page, "Chief");
    await chatMenu(page, "Chief", "Pin chat");
    const group = page.querySelector("[data-pinned-chats]")?.className.split(" ") ?? [];
    expect(group).toEqual(expect.arrayContaining(["border-b", "border-border", "pb-2", "mb-2"]));
  });

  it("lists what a search found in its own order, with no Pinned group", async () => {
    const page = await openMessenger(acme(["Chief", "Mara"]));
    await openChat(page, "Chief");
    await chatMenu(page, "Chief", "Pin chat");
    await pressKey("k", { ctrlKey: true });
    await typeIn(page.querySelector('nav input[type="search"]'), "here");

    expect(page.querySelector("[data-pinned-chats]")).toBeNull();
    expect(rowNames(page)).toEqual(["Mara", "Chief"]);
  });

  it("counts a pin as gone only when its source is online and lists chats without it", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const beta = messaging.addSource({ label: "Paperclip · Beta" });
    const empty = messaging.addSource({ label: "Paperclip · Empty" });
    messaging.addConversation(messaging.addAgent(acme.id, { name: "Chief" }).id);
    messaging.addConversation(messaging.addAgent(beta.id, { name: "Kim" }).id);
    messaging.goOffline(beta.id);
    const rows = await new Messenger(messaging).rows();

    expect(isGoneFrom(rows, { source: acme.id, conversation: "left-channel" })).toBe(true);
    expect(isGoneFrom(rows, { source: beta.id, conversation: "left-channel" })).toBe(false);
    expect(isGoneFrom(rows, { source: empty.id, conversation: "left-channel" })).toBe(false);
  });
});
