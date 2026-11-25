import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentAda, chatTask, me } from "./acme-data.test-helper.ts";
import { PaperclipIds } from "./ids.ts";
import { type MapContext, toMessage } from "./map.ts";

const context: MapContext = {
  ids: new PaperclipIds("acme"),
  agentNames: new Map([[agentAda, "Ada"]]),
  userId: me,
};

/** Ada's comment on the chat, as Paperclip lists it. */
function adaComment(overrides: Record<string, unknown> = {}) {
  return {
    id: "m3",
    body: "On it. Checking the build first.",
    authorAgentId: agentAda,
    createdAt: "2026-11-24T10:03:00.000Z",
    ...overrides,
  };
}

verifies("paperclip-client.automatic-notes", () => {
  describe("a fast-response receipt", () => {
    it("is an automatic message from the agent", () => {
      const message = toMessage(
        context,
        chatTask,
        adaComment({ fastResponseRequestId: "r0000000-0000-4000-8000-000000000003" }),
      );
      expect(message).toMatchObject({
        author: { kind: "agent", name: "Ada" },
        body: "On it. Checking the build first.",
        automatic: true,
      });
    });

    it("leaves the agent's own comments, and one with an empty request ID, unmarked", () => {
      expect(toMessage(context, chatTask, adaComment())?.automatic).toBeUndefined();
      const empty = adaComment({ fastResponseRequestId: null });
      expect(toMessage(context, chatTask, empty)?.automatic).toBeUndefined();
    });

    it("never marks the person's own comment", () => {
      const mine = {
        id: "m4",
        body: "Is 0.3 ready?",
        authorUserId: me,
        fastResponseRequestId: "r0000000-0000-4000-8000-000000000004",
        createdAt: "2026-11-24T10:04:00.000Z",
      };
      expect(toMessage(context, chatTask, mine)).toMatchObject({ author: { kind: "me" } });
      expect(toMessage(context, chatTask, mine)?.automatic).toBeUndefined();
    });
  });
});
