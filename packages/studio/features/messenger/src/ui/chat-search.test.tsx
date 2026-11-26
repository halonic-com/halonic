// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { openMessenger, pressKey, typeIn } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Acme's Chief, who asked about preview.98, and Liam, who never wrote "preview". */
function acme() {
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addConversation(messaging.addAgent(source.id, { name: "Chief" }).id);
  const liam = messaging.addConversation(messaging.addAgent(source.id, { name: "Liam" }).id);
  messaging.addMessage(chief.id, { body: "Merged #6162.\nSend preview.98 to the board's phone?" });
  messaging.addMessage(chief.id, { body: "Ready when you are." });
  messaging.addMessage(liam.id, { body: "Approved on head 3f9a2c1." });
  return messaging;
}

function rows(page: HTMLElement): string[] {
  return [...page.querySelectorAll("nav li button")].map((row) => row.textContent ?? "");
}

verifies("messenger.chat-search", () => {
  describe("the chat search", () => {
    it("is an icon over the list, with no search field until it is opened", async () => {
      const page = await openMessenger(acme());
      expect(page.querySelector('nav input[type="search"]')).toBeNull();
      expect(page.querySelector("nav [data-chat-search]")?.getAttribute("aria-label")).toBe(
        "Search chats (Ctrl+K)",
      );
    });

    it("opens on Ctrl+K, which the command palette then leaves alone", async () => {
      const page = await openMessenger(acme());
      let paletteSaw: boolean | undefined;
      const palette = (event: KeyboardEvent) => {
        paletteSaw = event.defaultPrevented;
      };
      window.addEventListener("keydown", palette);
      await pressKey("k", { ctrlKey: true });
      window.removeEventListener("keydown", palette);
      expect(paletteSaw).toBe(true);
      expect(document.activeElement).toBe(page.querySelector('nav input[type="search"]'));
    });

    it("lists only the chats that hold the text, with the line that holds it marked", async () => {
      const page = await openMessenger(acme());
      await pressKey("k", { ctrlKey: true });
      await typeIn(page.querySelector('nav input[type="search"]'), "PREVIEW");
      const found = rows(page);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^CChief.*Send preview\.98 to the board's phone\?/);
      expect(page.querySelector("nav li mark")?.textContent).toBe("preview");
      expect(page.querySelector('nav [role="status"]')?.textContent).toBe("1 chat");
      await typeIn(page.querySelector('nav input[type="search"]'), "invoice");
      expect(rows(page)).toEqual([]);
      expect(page.querySelector('nav [role="status"]')?.textContent).toBe("No chat matches.");
    });

    it("closes on Escape, shows every chat again and puts focus back on the icon", async () => {
      const page = await openMessenger(acme());
      await pressKey("k", { ctrlKey: true });
      const field = page.querySelector('nav input[type="search"]');
      await typeIn(field, "preview");
      await act(async () => {
        field?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(rows(page)).toHaveLength(2);
      expect(document.activeElement).toBe(page.querySelector("nav [data-chat-search]"));
    });
  });
});
