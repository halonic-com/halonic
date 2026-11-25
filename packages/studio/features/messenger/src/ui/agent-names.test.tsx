// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { openChat, openMessenger } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Acme's Liam, titled CTO, and Chief, with no title, each with a chat named as Paperclip does. */
function acmeChats() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const liam = messaging.addAgent(acme.id, { name: "Liam", title: "CTO" });
  const chief = messaging.addAgent(acme.id, { name: "Chief", title: "  " });
  messaging.addConversation(liam.id, { title: "Chat with Liam" });
  messaging.addConversation(chief.id, { title: "Chat with Chief" });
  return messaging;
}

function rowNames(page: HTMLElement): string[] {
  return [...page.querySelectorAll("nav li button bdi")].map((name) => name.textContent ?? "");
}

function header(page: HTMLElement): string | null | undefined {
  return page.querySelector("main h2")?.textContent;
}

verifies("messenger.agent-names", () => {
  describe("a chat's name", () => {
    it("is its agent's name and title in the row and the header, not the chat's own title", async () => {
      const page = await openMessenger(acmeChats());
      expect(rowNames(page)).toContain("Liam · CTO");
      await openChat(page, "Liam");
      expect(header(page)).toBe("Liam · CTO");
      expect(page.textContent).not.toContain("Chat with Liam");
    });

    it("is the name alone, with no dot, when the agent has no title", async () => {
      const page = await openMessenger(acmeChats());
      expect(rowNames(page)).toContain("Chief");
      await openChat(page, "Chief");
      expect(header(page)).toBe("Chief");
    });
  });
});
