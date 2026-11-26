// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { findInChat, openChat, openMessenger, press } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Chief's chat: "Shall I merge #12?", then "Morning", then "Merged #12.". */
function chiefsChat() {
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chat = messaging.addConversation(messaging.addAgent(source.id, { name: "Chief" }).id);
  for (const body of ["Shall I merge #12?", "Morning", "Merged #12."]) {
    messaging.addMessage(chat.id, { body });
  }
  return messaging;
}

function shown(page: HTMLElement): string | null | undefined {
  return page.querySelector("main [data-found=current] [data-bubble]")?.textContent;
}

function bar(page: HTMLElement): Element | null {
  return page.querySelector("main [data-find-bar]");
}

verifies("messenger.find-in-chat", () => {
  describe("the find bar", () => {
    it("opens from the header's icon, which takes the search field's place", async () => {
      const page = await openMessenger(chiefsChat());
      await openChat(page, "Chief");
      expect(page.querySelector('main header input[type="search"]')).toBeNull();
      await press(page.querySelector("main header [data-find]"));
      expect(document.activeElement).toBe(bar(page)?.querySelector("input"));
    });

    it("keeps every message, shows the newest match and says which of how many", async () => {
      const page = await openMessenger(chiefsChat());
      await openChat(page, "Chief");
      await findInChat(page, "#12");
      expect(page.querySelectorAll("main ol > li[data-author]")).toHaveLength(3);
      expect(page.querySelectorAll("main [data-found]")).toHaveLength(2);
      expect(shown(page)).toBe("Chief: Merged #12.");
      expect(bar(page)?.querySelector('[role="status"]')?.textContent).toBe("2 of 2");
    });

    it("moves up to the older match and down again, round the ends", async () => {
      const page = await openMessenger(chiefsChat());
      await openChat(page, "Chief");
      await findInChat(page, "#12");
      await press(bar(page)?.querySelector('[aria-label="Previous match"]'));
      expect(shown(page)).toBe("Chief: Shall I merge #12?");
      expect(bar(page)?.querySelector('[role="status"]')?.textContent).toBe("1 of 2");
      await press(bar(page)?.querySelector('[aria-label="Previous match"]'));
      expect(shown(page)).toBe("Chief: Merged #12.");
      await press(bar(page)?.querySelector('[aria-label="Next match"]'));
      expect(shown(page)).toBe("Chief: Shall I merge #12?");
    });

    it("closes on Escape, clears its marks and puts focus back on the icon", async () => {
      const page = await openMessenger(chiefsChat());
      await openChat(page, "Chief");
      await findInChat(page, "#12");
      await act(async () => {
        bar(page)
          ?.querySelector("input")
          ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(bar(page)).toBeNull();
      expect(page.querySelector("main [data-found]")).toBeNull();
      expect(document.activeElement).toBe(page.querySelector("main header [data-find]"));
    });
  });
});
