import { AgentHostReactions } from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** The desktop with `halonic` connected, as Studio connects it. */
async function connected(): Promise<Desktop> {
  desktop = await startDesktop();
  await desktop.paperclipKey.handOver({
    workspace: desktop.workspace,
    connection: "halonic",
    key: testKey,
    ...acme,
  });
  return desktop;
}

const chat = "paperclip:halonic:chat:task-1";
const message = "paperclip:halonic:comment:task-1:c1";
const notSupported = { outcome: "refused", reason: "not-supported" };

verifies("agent-host.message-reactions-routes", () => {
  describe("POST /v1/messaging/reactions and /react", () => {
    it("read a chat's reactions through its connection, named as messages are", async () => {
      const on = await connected();
      on.paperclip.reactions = {
        reactions: { c1: [{ emoji: "👀", by: { kind: "agent", id: "agent-ada" }, at: "t1" }] },
        commentId: "c1",
      };
      const reactions = new AgentHostReactions(on.transport, on.workspace);

      expect(await reactions.list(chat)).toEqual({
        outcome: "read",
        reactions: {
          [message]: [
            {
              emoji: "👀",
              by: { kind: "agent", agent: "paperclip:halonic:agent:agent-ada", name: "Ada" },
              at: "t1",
            },
          ],
        },
      });
      const seen = on.paperclip.seen.filter((request) => request.url.includes("/reactions/task-1"));
      expect(seen.map((request) => request.authorization)).toEqual([`Bearer ${testKey}`]);
    });

    it("are not supported without the plugin, or for a source no connection serves", async () => {
      const on = await connected();
      const reactions = new AgentHostReactions(on.transport, on.workspace);

      expect(await reactions.list(chat)).toEqual(notSupported);
      expect(await reactions.react("paperclip:other:comment:t:c", "👍", true)).toEqual(
        notSupported,
      );
    });

    it("refuse an emoji outside the six before anything is sent", async () => {
      const on = await connected();
      const answer = await on.transport.request("POST /v1/messaging/react", {
        workspace: on.workspace,
        message,
        emoji: "🎉",
        on: true,
      });

      expect(answer.status).toBe(400);
      expect(on.paperclip.seen.some((request) => request.url.includes("/reactions/"))).toBe(false);
    });
  });
});
