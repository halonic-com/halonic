import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { AgentInbox } from "./agent-inbox.ts";

/** Lets every promise that is already settled run its callbacks. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

verifies("inbox.agent-inbox-items", () => {
  describe("AgentInbox", () => {
    it("reads while someone listens, and stops following changes once the last one leaves", async () => {
      const messaging = new FakeAgentMessaging();
      const source = messaging.addSource({ label: "Paperclip · Acme" });
      const list = vi.spyOn(messaging, "listInboxItems");
      const inbox = new AgentInbox(messaging);
      const leave = inbox.subscribe(() => {});
      await settled();
      expect(inbox.state.loaded).toBe(true);
      messaging.addInboxItem(source.id, { question: "Ship it?" });
      await settled();
      expect(inbox.state.items).toHaveLength(1);
      const reads = list.mock.calls.length;
      leave();
      messaging.addInboxItem(source.id, { question: "And this?" });
      await settled();
      expect(list).toHaveBeenCalledTimes(reads);
    });

    it("keeps the newest read when an older one ends after it", async () => {
      const messaging = new FakeAgentMessaging();
      const source = messaging.addSource({ label: "Paperclip · Acme" });
      let finishOld: (() => void) | undefined;
      const real = messaging.listInboxItems.bind(messaging);
      vi.spyOn(messaging, "listInboxItems").mockImplementationOnce(async () => {
        const old = await real();
        await new Promise<void>((resolve) => {
          finishOld = resolve;
        });
        return old;
      });
      const inbox = new AgentInbox(messaging);
      const older = inbox.refresh();
      messaging.addInboxItem(source.id, { question: "Ship it?" });
      await inbox.refresh();
      finishOld?.();
      await older;
      expect(inbox.state.items.map((item) => item.question)).toEqual(["Ship it?"]);
    });
  });
});
