import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { inboxKeyOf, openMessagingItem } from "./open-messaging-item.ts";

/** A Studio window whose Inbox and place switcher record what they were asked. */
function studioWindow() {
  const calls: string[] = [];
  return {
    calls,
    window: {
      inbox: { requestOpen: (key: string) => calls.push(`requestOpen ${key}`) },
      openPlace: (place: string) => calls.push(`openPlace ${place}`),
    },
  };
}

verifies("services.open-messaging-item", () => {
  describe("openMessagingItem", () => {
    it("selects the Inbox item, then shows the Inbox", () => {
      const { calls, window } = studioWindow();
      expect(openMessagingItem({ id: "item-acme-7", kind: "inbox-item" }, window)).toBe("opened");
      expect(calls).toEqual(["requestOpen agent:item-acme-7", "openPlace inbox"]);
    });

    it("never answers or sends", () => {
      // The window hands in the whole Inbox, which can also answer and send; only `requestOpen` may run.
      const answer = vi.fn();
      const send = vi.fn();
      const { window } = studioWindow();
      const inbox = { ...window.inbox, answer, send };
      openMessagingItem({ id: "item-acme-7", kind: "inbox-item" }, { ...window, inbox });
      openMessagingItem({ id: "chat-acme-2", kind: "conversation" }, { ...window, inbox });
      expect(answer).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it("leaves a conversation alone until the Messenger is there", () => {
      const { calls, window } = studioWindow();
      expect(openMessagingItem({ id: "chat-acme-2", kind: "conversation" }, window)).toBe(
        "no-messenger",
      );
      expect(calls).toEqual([]);
    });

    it("says so when the window has no Inbox", () => {
      const { calls, window } = studioWindow();
      const withoutInbox = { ...window, inbox: undefined };
      expect(openMessagingItem({ id: "item-acme-7", kind: "inbox-item" }, withoutInbox)).toBe(
        "no-inbox",
      );
      expect(calls).toEqual([]);
      const withoutPlaces = { ...window, openPlace: undefined };
      expect(openMessagingItem({ id: "item-acme-7", kind: "inbox-item" }, withoutPlaces)).toBe(
        "no-inbox",
      );
      expect(calls).toEqual([]);
    });

    it("uses the Inbox list's key for agent items", () => {
      expect(inboxKeyOf("item-acme-7")).toBe("agent:item-acme-7");
    });
  });
});
