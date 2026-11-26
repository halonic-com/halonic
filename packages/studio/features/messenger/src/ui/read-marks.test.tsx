// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { button, polyfillModals } from "../test-support/modal.ts";
import { byText, openChat, openMessenger, press, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

beforeEach(polyfillModals);
afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

/** Acme's Chief, with one message the board hasn't seen; each message a minute after the last. */
function acme() {
  let minute = 0;
  const messaging = new FakeAgentMessaging({
    now: () => new Date(Date.UTC(2026, 10, 26, 9, minute++)),
  });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  messaging.addMessage(chat.id, { body: "Shall I merge #12?" });
  return messaging;
}

/** Chief's row in the list: its item, which holds the row's button and its action. */
function chiefRow(page: HTMLElement): HTMLElement {
  const row = byText(page, "nav li", "Chief");
  if (!(row instanceof HTMLElement)) throw new Error("no row for Chief");
  return row;
}

/** What Chief's row's own button says, without its action. */
function chiefRowText(page: HTMLElement): string {
  return chiefRow(page).querySelector("button")?.textContent ?? "";
}

verifies("messenger.read-marks", () => {
  it("clears an unread row's count with Mark as read", async () => {
    const page = await openMessenger(acme());
    expect(chiefRowText(page)).toContain("1 unread");

    await press(byText(chiefRow(page), "button", "Mark as read"));

    expect(chiefRowText(page)).not.toContain("unread");
    expect(byText(chiefRow(page), "button", "Mark as unread")).toBeDefined();
  });

  it("names each row's action after its chat, with the words seen first", async () => {
    const page = await openMessenger(acme());
    const markRead = byText(chiefRow(page), "button", "Mark as read");

    expect(markRead?.getAttribute("aria-label")).toBe("Mark as read: Chief");
    expect(markRead?.textContent).toBe("Mark as read");

    await press(markRead);

    const markUnread = byText(chiefRow(page), "button", "Mark as unread");
    expect(markUnread?.getAttribute("aria-label")).toBe("Mark as unread: Chief");
  });

  it("gives a read row its count again with Mark as unread", async () => {
    const page = await openMessenger(acme());
    await press(byText(chiefRow(page), "button", "Mark as read"));

    await press(byText(chiefRow(page), "button", "Mark as unread"));

    expect(chiefRowText(page)).toContain("1 unread");
  });

  it("marks the open chat unread from the header's ··· menu, closes it and focuses its row", async () => {
    const page = await openMessenger(acme());
    await openChat(page, "Chief");
    await press(button("More actions for Chief", page.querySelector("main header") ?? page));

    await press(byText(page, "[role=menuitem]", "Mark as unread"));

    expect(page.querySelector("main header")).toBeNull();
    expect(chiefRowText(page)).toContain("1 unread");
    expect(document.activeElement).toBe(chiefRow(page).querySelector("button"));
  });

  it("keeps the chat unread when a read lands after the header's Mark as unread closed it", async () => {
    const messaging = acme();
    const [source] = await messaging.listSources();
    const page = await openMessenger(messaging);
    await openChat(page, "Chief");
    // Every read of messages waits until the menu pick is done.
    const held: (() => void)[] = [];
    const listMessages = messaging.listMessages.bind(messaging);
    vi.spyOn(messaging, "listMessages").mockImplementation(async (conversation) => {
      await new Promise<void>((resolve) => held.push(resolve));
      return listMessages(conversation);
    });
    messaging.addWork(source?.id ?? "", { label: "HAL-12", title: "Merge #12" });
    await settle();
    await press(button("More actions for Chief", page.querySelector("main header") ?? page));
    await press(byText(page, "[role=menuitem]", "Mark as unread"));

    expect(held.length).toBeGreaterThan(0);
    for (const release of held) release();
    await settle();

    expect(chiefRowText(page)).toContain("1 unread");
  });

  it("offers no action on the open chat's row", async () => {
    const page = await openMessenger(acme());

    await openChat(page, "Chief");

    expect(chiefRow(page).querySelectorAll("button")).toHaveLength(1);
  });

  it("offers no ··· menu once the board wrote last", async () => {
    const messaging = acme();
    const [chat] = await messaging.listConversations();
    messaging.addMessage(chat?.id ?? "", { body: "Yes", author: { kind: "me" } });
    const page = await openMessenger(messaging);
    await openChat(page, "Chief");

    expect(page.querySelector('main header button[aria-label^="More actions"]')).toBeNull();
  });
});
