// @vitest-environment jsdom
import type { Message } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { memberName } from "../channel.ts";
import type { ConversationRow } from "../messenger.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { authorOf, MessageTo } from "./channel-message.tsx";

afterEach(unmountAll);

/** A channel whose source and agents are gone: nothing in it can be named. */
const orphan: ConversationRow = {
  conversation: {
    id: "engineering",
    source: "acme",
    agent: "chief",
    members: ["chief", "liam"],
    title: "Engineering",
    updatedAt: "2026-11-24T10:00:00.000Z",
    waitingForMe: false,
  },
  agents: [],
  sourceAgents: [],
  source: undefined,
};

function message(overrides: Partial<Message>): Message {
  return {
    id: "m1",
    conversation: "engineering",
    author: { kind: "me" },
    body: "Hello",
    attachments: [],
    sentAt: "2026-11-24T10:00:00.000Z",
    ...overrides,
  };
}

verifies("messenger.author-from-source", () => {
  describe("a channel whose source is gone", () => {
    it("says the author is no longer listed, never the message's display name", () => {
      const fromBoard = message({ author: { kind: "agent", agent: "chief", name: "Board" } });
      expect(authorOf(fromBoard, orphan)).toBe("No longer listed");
    });

    it("names a member whose source is gone the same way, never with an empty label", () => {
      expect(memberName(orphan, "chief")).toBe("No longer listed");
      const acme = { id: "acme", provider: "paperclip", label: "Paperclip · Acme" } as const;
      const withSource = { ...orphan, source: { ...acme, state: { kind: "signed-out" } } } as const;
      expect(memberName(withSource, "chief")).toBe("No longer in Paperclip · Acme");
    });

    it("shows no To line when nobody it went to can be named", () => {
      const page = render(<MessageTo message={message({ to: ["chief", "liam"] })} row={orphan} />);
      expect(page.textContent).toBe("");
    });
  });
});
