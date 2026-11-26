// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { openChat, openMessenger } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** A note that would be bold, HTML and a script link if anything read it as markup. */
const markup = "**x** <b>y</b> [z](javascript:1)";

/** Acme's Chief, working on the board's question, with one note and one answer in Markdown. */
function acme() {
  const clock = { now: new Date(2026, 10, 25, 9, 0) };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief", activity: "working" });
  const chat = messaging.addConversation(chief.id);
  messaging.addMessage(chat.id, { author: { kind: "me" }, body: "Is 0.3 ready?" });
  clock.now = new Date(2026, 10, 25, 9, 0, 30);
  messaging.addMessage(chat.id, { body: markup, automatic: true, plainText: true });
  clock.now = new Date(2026, 10, 25, 9, 4);
  messaging.addMessage(chat.id, { body: "Yes, **0.3** is built." });
  return messaging;
}

const noon = () => new Date(2026, 10, 25, 12, 0);

verifies("messenger.plain-text-notes", () => {
  describe("a plain-text note", () => {
    it("shows exactly as written, with no bold, HTML or link", async () => {
      const page = await openMessenger(acme(), [], false, noon);
      await openChat(page, "Chief");
      const note = page.querySelector("main ol > li[data-automatic] [data-bubble]");
      expect(note?.querySelector("[data-plain-text]")?.textContent).toBe(
        "**x** <b>y</b> [z](javascript:1)",
      );
      expect(note?.querySelectorAll("strong, b, a, code, em")).toHaveLength(0);
    });

    it("leaves the agent's own answer in Markdown", async () => {
      const page = await openMessenger(acme(), [], false, noon);
      await openChat(page, "Chief");
      const answers = page.querySelectorAll(
        "main ol > li[data-author=agent]:not([data-automatic])",
      );
      expect(answers[0]?.querySelector("strong")?.textContent).toBe("0.3");
      expect(answers[0]?.querySelector("[data-plain-text]")).toBeNull();
    });
  });
});
