// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { button, openDialog, polyfillModals } from "../test-support/modal.ts";
import {
  byText,
  findInChat,
  openChat,
  openMessenger,
  press,
  said,
  settle,
  typeAndSend,
} from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** A clock that moves a minute on each read, so every item has its own time. */
function ticking(): () => Date {
  let minutes = 0;
  return () => new Date(Date.UTC(2026, 10, 24, 10, minutes++));
}

/** Two sources, each with an agent named Chief; Acme's Chief asked something and waits. */
function twoChiefs() {
  const messaging = new FakeAgentMessaging({ now: ticking() });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const globex = messaging.addSource({ label: "Paperclip · Globex" });
  const acmeChief = messaging.addAgent(acme.id, { name: "Chief", activity: "waiting" });
  const globexChief = messaging.addAgent(globex.id, { name: "Chief", activity: "idle" });
  const acmeChat = messaging.addConversation(acmeChief.id);
  messaging.addConversation(globexChief.id);
  messaging.addMessage(acmeChat.id, { body: "Shall I merge #12?" });
  return { messaging, acme, acmeChat };
}

/** Acme with a chat with Chief, and the channels Engineering and Design. */
function acmeChannels() {
  const messaging = new FakeAgentMessaging({ now: ticking() });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const [chief, liam] = ["Chief", "Liam"].map((name) => messaging.addAgent(acme.id, { name }));
  if (chief === undefined || liam === undefined) throw new Error("no agents");
  const members = [chief.id, liam.id];
  messaging.addConversation(chief.id);
  messaging.addConversation(chief.id, { title: "Engineering", members });
  messaging.addConversation(chief.id, { title: "Design", members });
  return messaging;
}

/** Leaves the channel whose row holds `name`, through its header and the dialog. */
async function leaveChannel(page: HTMLElement, name: string): Promise<void> {
  await openChat(page, name);
  await press(byText(page, "header button", "Leave channel"));
  await press(button("Leave", openDialog() ?? document));
}

/** What the page's own status region last read out, such as "You left Engineering.". */
function pageSaid(page: HTMLElement): string | null | undefined {
  return page.querySelector("[data-page-status]")?.textContent;
}

function rows(page: HTMLElement): string[] {
  return [...page.querySelectorAll("nav li > button:first-child")].map(
    (row) => row.textContent ?? "",
  );
}

/** Opens Acme's chat with Chief, the one whose row names Acme. */
function openAcmeChat(page: HTMLElement): Promise<HTMLTextAreaElement> {
  return openChat(page, "Acme");
}

/** What the find bar says: "1 of 2", or that nothing matches. */
function findSays(page: HTMLElement): string | null | undefined {
  return page.querySelector('main [data-find-bar] [role="status"]')?.textContent;
}

verifies("messenger.conversations", () => {
  describe("MessengerPage", () => {
    it("shows two conversations named Chief, each with its source's label, and the activity in the header", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging);
      const [acme, globex] = rows(page);
      expect(acme).toMatch(/^CChief · Paperclip · Acme.*Shall I merge #12\?1 unread$/);
      expect(globex).toBe("CChief · Paperclip · Globex");
      await openAcmeChat(page);
      expect(page.querySelector("main header p")?.textContent).toBe("Paperclip · Acme · Waiting");
    });

    it("lists every conversation in one list, with no tabs (HAL-19132)", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging);
      expect(page.querySelector('[role="tab"]')).toBeNull();
      expect(rows(page)).toHaveLength(2);
    });

    it("sends a message and shows it in the conversation, with the agent's activity in the header", async () => {
      const { messaging, acmeChat } = twoChiefs();
      const send = vi.spyOn(messaging, "send");
      const page = await openMessenger(messaging);
      const box = await openAcmeChat(page);
      expect(page.querySelector("header")?.textContent).toContain("Paperclip · Acme · Waiting");
      await typeAndSend(box, "Morning");
      expect(send).toHaveBeenCalledWith(acmeChat.id, "Morning");
      expect(page.querySelector("main ol")?.textContent).toContain("You: Morning");
      expect(box.value).toBe("");
    });

    it("offline, keeps the typed text in the box and sends nothing", async () => {
      const { messaging, acme } = twoChiefs();
      messaging.goOffline(acme.id);
      const send = vi.spyOn(messaging, "send");
      const page = await openMessenger(messaging);
      const box = await openAcmeChat(page);
      await typeAndSend(box, "Morning");
      expect(send).not.toHaveBeenCalled();
      expect(box.value).toBe("Morning");
      expect(page.textContent).toContain("Paperclip · Acme is offline. Your message stays here");
    });

    it("finds the chat's messages by their text, marking the match in the whole chat", async () => {
      const { messaging, acmeChat } = twoChiefs();
      messaging.addMessage(acmeChat.id, { body: "Morning" });
      const page = await openMessenger(messaging);
      await openAcmeChat(page);
      await findInChat(page, "merge");
      const shown = page.querySelector("main ol")?.textContent ?? "";
      expect(shown).toContain("Shall I merge #12?");
      expect(shown).toContain("Morning");
      expect(page.querySelector("main [data-found=current]")?.textContent).toContain("merge #12");
      expect(findSays(page)).toBe("1 of 1");
    });

    it("says so when no message in the chat matches the search", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging);
      await openAcmeChat(page);
      await findInChat(page, "invoice");
      const transcript = page.querySelector("main ol");
      expect(transcript?.querySelector("[data-found]")).toBeNull();
      // In a status region that is always there, outside the list, so a screen reader reads it.
      const status = page.querySelector('main [data-find-bar] [role="status"]');
      expect(status?.textContent).toBe("No message in this chat matches.");
      expect(transcript?.contains(status ?? null)).toBe(false);
      await findInChat(page, "");
      expect(status?.isConnected).toBe(true);
      expect(status?.textContent).toBe("");
    });

    it("reads out what the agent writes after the chat opened, but not on a search or another chat", async () => {
      const { messaging, acmeChat } = twoChiefs();
      const page = await openMessenger(messaging);
      await openAcmeChat(page);
      expect(said(page)).toBe("");
      await findInChat(page, "merge");
      await findInChat(page, "");
      expect(said(page)).toBe("");
      await act(async () => void messaging.addMessage(acmeChat.id, { body: "x".repeat(150) }));
      await settle();
      expect(said(page)).toBe(`Chief: ${"x".repeat(100)}`);
      await openChat(page, "Globex");
      expect(said(page)).toBe("");
    });

    it("in a narrow window shows the list or the open chat, and Back to chats focuses its row", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging, [], true);
      expect(page.querySelector("main")).toBeNull();
      const box = await openAcmeChat(page);
      expect(page.querySelector("nav")).toBeNull();
      expect(document.activeElement).toBe(box);
      await press(byText(page, "main button", "Back to chats"));
      expect(page.querySelector("main")).toBeNull();
      expect(document.activeElement).toBe(byText(page, "nav li button", "Acme"));
    });

    it("in a narrow window, Back to chats focuses the row of a chat the person answered", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging, [], true);
      const box = await openAcmeChat(page);
      await typeAndSend(box, "Yes, merge it");
      await press(byText(page, "main button", "Back to chats"));
      expect(document.activeElement).toBe(byText(page, "nav li button", "Acme"));
    });

    it("after Leave, focuses the row that took the channel's place and says it left (HAL-18835)", async () => {
      polyfillModals();
      const page = await openMessenger(acmeChannels());
      const before = [...page.querySelectorAll("nav li button")].map((row) => row.textContent);
      const index = before.findIndex((row) => row?.includes("Engineering"));
      await leaveChannel(page, "Engineering");
      const after = [...page.querySelectorAll<HTMLElement>("nav li button")];
      expect(after.map((row) => row.textContent)).toEqual(before.filter((_, at) => at !== index));
      expect(document.activeElement).toBe(after[index] ?? after.at(-1));
      expect(pageSaid(page)).toBe("You left Engineering.");
    });

    it("after leaving the last chat, focuses the list's first button", async () => {
      polyfillModals();
      const messaging = new FakeAgentMessaging({ now: ticking() });
      const acme = messaging.addSource({ label: "Paperclip · Acme" });
      const [chief, liam] = ["Chief", "Liam"].map((name) => messaging.addAgent(acme.id, { name }));
      const members = [chief?.id ?? "", liam?.id ?? ""];
      messaging.addConversation(chief?.id ?? "", { title: "Engineering", members });
      const page = await openMessenger(messaging);
      await leaveChannel(page, "Engineering");
      expect(rows(page)).toEqual([]);
      expect(document.activeElement).toBe(page.querySelector("nav button"));
      expect(pageSaid(page)).toBe("You left Engineering.");
    });

    it("finds without reading the chat again, so a find never shows an older read's messages", async () => {
      const { messaging, acmeChat } = twoChiefs();
      messaging.addMessage(acmeChat.id, { body: "Morning" });
      const page = await openMessenger(messaging);
      await openAcmeChat(page);
      const reads = vi.spyOn(messaging, "listMessages");
      await findInChat(page, "merge");
      await findInChat(page, "morning");
      expect(reads).not.toHaveBeenCalled();
      expect(page.querySelector("main [data-found=current]")?.textContent).toContain("Morning");
    });

    it("renders a message's `<script>` and `javascript:` link as inert text, and opens web links outside", async () => {
      const { messaging, acmeChat } = twoChiefs();
      messaging.addMessage(acmeChat.id, {
        body: "<script>alert(1)</script> [Approve](javascript:alert(1)) ![x](https://acme.example/x.png) [PR](https://acme.example/pr/12)",
      });
      const opened: string[] = [];
      const page = await openMessenger(messaging, opened);
      await openAcmeChat(page);
      const transcript = page.querySelector("main ol");
      expect(transcript?.querySelector("script, img, iframe")).toBeNull();
      expect(transcript?.textContent).toContain("<script>alert(1)</script>");
      expect(transcript?.textContent).toContain("[Approve](javascript:alert(1))");
      const links = [...(transcript?.querySelectorAll("a") ?? [])].map((link) =>
        link.getAttribute("href"),
      );
      expect(links).toEqual(["https://acme.example/pr/12"]);
      await press(transcript?.querySelector("a"));
      expect(opened).toEqual(["https://acme.example/pr/12"]);
    });

    it("shows a task link the connector made a full Paperclip address as a link that opens outside", async () => {
      // What the Paperclip connector sends for Chief's `[ACME-8](/ACME/issues/ACME-8)` (HAL-19407).
      const task = "https://paperclip.acme.test/ACME/issues/ACME-8";
      const { messaging, acmeChat } = twoChiefs();
      messaging.addMessage(acmeChat.id, { body: `Done, see [ACME-8](${task}).` });
      const opened: string[] = [];
      const page = await openMessenger(messaging, opened);
      await openAcmeChat(page);
      const link = page.querySelector("main ol a");
      expect(link?.textContent).toMatch(/^ACME-8/);
      expect(link?.getAttribute("href")).toBe(task);
      await press(link);
      expect(opened).toEqual([task]);
    });
  });
});

verifies("messenger.framed-list", () => {
  it("keeps the list on the window's frame and the open chat on its own panel, 8px apart", async () => {
    const { messaging } = twoChiefs();
    const page = await openMessenger(messaging);
    await openAcmeChat(page);
    const list = page.querySelector("nav") as HTMLElement;
    const chat = page.querySelector("main") as HTMLElement;
    const listClasses = list.className.split(" ");
    const pageClasses = (list.parentElement as HTMLElement).className.split(" ");

    expect(pageClasses).toContain("gap-2");
    expect(pageClasses).not.toContain("bg-app-panel");
    expect(listClasses).not.toContain("bg-app-panel");
    expect(listClasses.some((name) => name.startsWith("border"))).toBe(false);
    expect(chat.className.split(" ")).toEqual(
      expect.arrayContaining(["rounded-lg", "border", "border-border", "bg-app-panel"]),
    );
  });
});
