import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { agentAda, chatTask, me } from "./acme-data.test-helper.ts";
import { connect, FakePaperclip, type Network, sourceId } from "./fake-paperclip.test-helper.ts";
import { fitsBody } from "./requests.ts";

let paperclip: FakePaperclip;
const network: Network = { offline: false };
const chat = `${sourceId}:chat:${chatTask}`;
const message = `${sourceId}:comment:${chatTask}:m1`;
const route = `/api/plugins/halonic.agent-tools/api/reactions/${chatTask}`;
const thumbs = { emoji: "👍", by: { kind: "user", id: me }, at: "2026-11-25T09:00:00.000Z" };
const eyes = { emoji: "👀", by: { kind: "agent", id: agentAda }, at: "2026-11-25T09:01:00.000Z" };

function reactions() {
  return connect(paperclip, network).reactions();
}

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip().serveAcme();
});

verifies("paperclip-client.reactions", () => {
  describe("a chat's reactions", () => {
    it("are named as messages are: the person as me, an agent by its name", async () => {
      paperclip.on("GET", route, { body: { reactions: { m1: [thumbs, eyes], m2: [] } } });
      expect(await reactions().list(chat)).toEqual({
        outcome: "read",
        reactions: {
          [message]: [
            { emoji: "👍", by: { kind: "me" }, at: thumbs.at },
            {
              emoji: "👀",
              by: { kind: "agent", agent: `${sourceId}:agent:${agentAda}`, name: "Ada" },
              at: eyes.at,
            },
          ],
        },
      });
      const read = paperclip.seen.find((request) => request.path === route);
      expect(read?.query.get("companyId")).toBeTruthy();
    });

    it("leave out an entry they can't read, such as an emoji outside the six", async () => {
      const party = { ...thumbs, emoji: "🎉" };
      paperclip.on("GET", route, { body: { reactions: { m1: [party, { emoji: "👍" }] } } });
      expect(await reactions().list(chat)).toEqual({ outcome: "read", reactions: {} });
    });

    it("are not supported where the plugin isn't installed", async () => {
      paperclip.on("GET", route, { status: 404, body: { error: "Not found" } });
      expect(await reactions().list(chat)).toEqual({ outcome: "refused", reason: "not-supported" });
    });

    it("are refused offline, and for another connection's chat before any request", async () => {
      network.offline = true;
      expect(await reactions().list(chat)).toEqual({ outcome: "refused", reason: "offline" });
      network.offline = false;
      const before = paperclip.seen.length;
      expect(await reactions().list("paperclip:other:chat:x")).toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      expect(paperclip.seen.length).toBe(before);
    });
  });

  describe("the person's own reaction", () => {
    it("is posted with exactly commentId, emoji and on, and answers the message's reactions", async () => {
      paperclip.on("POST", route, { body: { commentId: "m1", reactions: [thumbs] } });
      expect(await reactions().react(message, "👍", true)).toEqual({
        outcome: "saved",
        reactions: [{ emoji: "👍", by: { kind: "me" }, at: thumbs.at }],
      });
      const sent = paperclip.seen.find((request) => request.method === "POST");
      expect(sent?.body).toEqual({ commentId: "m1", emoji: "👍", on: true });
    });

    it("may send only a boolean on", () => {
      expect(fitsBody("setReaction", { commentId: "m1", emoji: "👍", on: false })).toBe(true);
      expect(fitsBody("setReaction", { commentId: "m1", emoji: "👍", on: "true" })).toBe(false);
      expect(fitsBody("setReaction", { commentId: "m1", emoji: "👍", on: true, x: "y" })).toBe(
        false,
      );
    });

    it("is refused as not-found for a message the plugin doesn't know, or that isn't a message", async () => {
      paperclip.on("POST", route, {
        status: 404,
        body: { error: "No such message on this task." },
      });
      expect(await reactions().react(message, "❤️", true)).toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      expect(await reactions().react(chat, "❤️", true)).toEqual({
        outcome: "refused",
        reason: "not-found",
      });
    });
  });
});
