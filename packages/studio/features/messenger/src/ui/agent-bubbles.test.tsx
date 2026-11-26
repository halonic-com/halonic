// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { openChat, openMessenger } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Chief's chat: "Morning" and "Build is green" from Chief, then the board's "Thanks". */
function chiefsChat() {
  const clock = { now: new Date(2026, 10, 25, 9, 0) };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chat = messaging.addConversation(messaging.addAgent(source.id, { name: "Chief" }).id);
  messaging.addMessage(chat.id, { body: "Morning" });
  clock.now = new Date(2026, 10, 25, 9, 1);
  messaging.addMessage(chat.id, { body: "Build is green" });
  clock.now = new Date(2026, 10, 25, 9, 5);
  messaging.addMessage(chat.id, { author: { kind: "me" }, body: "Thanks" });
  return messaging;
}

const noon = () => new Date(2026, 10, 25, 12, 0);

verifies("messenger.agent-bubbles", () => {
  describe("an agent's message", () => {
    it("sits on the start side in a bubble in the agent's own tint, the name and time above the run", async () => {
      const page = await openMessenger(chiefsChat(), [], false, noon);
      await openChat(page, "Chief");
      const agents = [...page.querySelectorAll("main ol > li[data-author='agent']")];
      expect(agents.map((line) => line.querySelector("[data-bubble]")?.textContent)).toEqual([
        "Chief: Morning",
        "Chief: Build is green",
      ]);
      const bubble = agents[0]?.querySelector("[data-bubble]");
      // No edge; the tint is the agent's, the same on every message of theirs (HAL-19132).
      expect(bubble?.className).toMatch(/\bbg-agent-(sky|teal|green|sand|coral|indigo)\b/);
      expect(bubble?.className).not.toMatch(/\bborder\b/);
      const tint = bubble?.className.match(/bg-agent-\w+/)?.[0];
      expect(agents[1]?.querySelector("[data-bubble]")?.className).toContain(tint);
      // The name is semibold in the normal text colour; the time stays muted.
      expect(agents[0]?.querySelector("[data-author-name]")?.className).toBe(
        "font-semibold text-fg",
      );
      // The person's bubbles take the end side; an agent's don't.
      expect(agents[0]?.className).not.toContain("ms-auto");
      expect(page.querySelector("main ol > li[data-author='me']")?.className).toContain("ms-auto");
      // Only the run's first message has "Chief · 09:00" above its bubble.
      expect(agents[0]?.textContent).toContain("Chief · 09:00");
      expect(agents[1]?.textContent).not.toContain("09:01");
    });
  });
});
