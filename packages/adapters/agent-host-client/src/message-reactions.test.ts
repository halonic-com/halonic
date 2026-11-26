import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostReactions } from "./message-reactions.ts";

const workspace = "/work/acme";
const listRoute = "POST /v1/messaging/reactions";
const reactRoute = "POST /v1/messaging/react";
const chat = "paperclip:acme:chat:task-1";
const message = "paperclip:acme:comment:task-1:c1";
const thumbs = { emoji: "👍", by: { kind: "me" }, at: "2026-11-25T09:00:00.000Z" };

verifies("agent-host-client.message-reactions", () => {
  describe("AgentHostReactions", () => {
    it("lists a conversation's reactions in the workspace and passes on the host's result", async () => {
      const read = { outcome: "read", reactions: { [message]: [thumbs] } };
      const host = new FakeHost().answer(listRoute, ok({ result: read }));

      expect(await new AgentHostReactions(host, workspace).list(chat)).toEqual(read);
      expect(host.calls.map((call) => [call.route, call.body])).toEqual([
        [listRoute, { workspace, conversation: chat }],
      ]);
    });

    it("sends the person's reaction with the message, the emoji and on", async () => {
      const saved = { outcome: "saved", reactions: [] };
      const host = new FakeHost().answer(reactRoute, ok({ result: saved }));

      expect(await new AgentHostReactions(host, workspace).react(message, "👍", false)).toEqual(
        saved,
      );
      expect(host.calls.map((call) => call.body)).toEqual([
        { workspace, message, emoji: "👍", on: false },
      ]);
    });

    it("reads a host older than reactions as not supported, so the chat still shows", async () => {
      const missing = refused(404, "not_found", "The agent host doesn't serve this path.");
      const host = new FakeHost().answer(listRoute, missing).answer(reactRoute, missing);
      const reactions = new AgentHostReactions(host, workspace);

      const notSupported = { outcome: "refused", reason: "not-supported" };
      expect(await reactions.list(chat)).toEqual(notSupported);
      expect(await reactions.react(message, "👍", true)).toEqual(notSupported);
    });

    it("fails with the host's kind for any other refusal", async () => {
      const host = new FakeHost().answer(listRoute, refused(404, "unknown_workspace", "x"));

      await expect(new AgentHostReactions(host, workspace).list(chat)).rejects.toMatchObject({
        kind: "unknown_workspace",
      });
    });
  });
});
