import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { manifest } from "./manifest.ts";
import { reactionsReadRouteKey, reactionsWriteRouteKey } from "./reaction-declarations.ts";
import {
  agentActor,
  agentReply,
  boardActor,
  boardMessage,
  chatTask,
  fakeReactionContext,
  reactionRequest,
} from "./reactions.test-helper.ts";
import { applyReaction, handleReactionsRead, handleReactionsWrite } from "./reactions.ts";

const now = new Date("2026-11-26T14:00:00.000Z");
const board = { kind: "user", id: "user-board" } as const;

function write(ctx: ReturnType<typeof fakeReactionContext>, body: unknown, actor = boardActor) {
  return handleReactionsWrite(reactionRequest(reactionsWriteRouteKey, actor, body), ctx, now);
}

function read(ctx: ReturnType<typeof fakeReactionContext>, actor = boardActor, taskId?: string) {
  return handleReactionsRead(reactionRequest(reactionsReadRouteKey, actor, null, taskId), ctx);
}

verifies("paperclip.messenger-reactions-store", () => {
  describe("the board's reaction routes", () => {
    test("both are declared board only", () => {
      const routes = manifest.apiRoutes?.filter((route) => route.path === "/reactions/:taskId");
      expect(routes?.map((route) => [route.method, route.auth])).toEqual([
        ["GET", "board"],
        ["POST", "board"],
      ]);
    });

    test("a reaction on any message of the task is kept and read back", async () => {
      const ctx = fakeReactionContext();
      const added = { commentId: agentReply.id, emoji: "👍", on: true };
      const reaction = { emoji: "👍", by: board, at: now.toISOString() };
      expect(await write(ctx, added)).toEqual({
        status: 200,
        body: { commentId: agentReply.id, reactions: [reaction] },
      });
      expect(await read(ctx)).toEqual({
        status: 200,
        body: { reactions: { [agentReply.id]: [reaction] } },
      });
    });

    test("removing the person's only reaction drops the message from the list", async () => {
      const ctx = fakeReactionContext();
      await write(ctx, { commentId: boardMessage.id, emoji: "😂", on: true });
      await write(ctx, { commentId: boardMessage.id, emoji: "😂", on: false });
      expect(await read(ctx)).toEqual({ status: 200, body: { reactions: {} } });
    });

    test("an agent's key gets 403 on both and nothing is written", async () => {
      const ctx = fakeReactionContext();
      const body = { commentId: boardMessage.id, emoji: "👍", on: true };
      expect((await write(ctx, body, agentActor)).status).toBe(403);
      expect((await read(ctx, agentActor)).status).toBe(403);
      expect(ctx.saved.size).toBe(0);
    });

    test("an unknown task or message is 404 and a wrong body is 400, before any write", async () => {
      const ctx = fakeReactionContext();
      expect((await read(ctx, boardActor, "../other")).status).toBe(404);
      const unknownComment = "9d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
      expect((await write(ctx, { commentId: unknownComment, emoji: "👍", on: true })).status).toBe(
        404,
      );
      expect((await write(ctx, { commentId: boardMessage.id, emoji: "🎉", on: true })).status).toBe(
        400,
      );
      expect((await write(ctx, { commentId: boardMessage.id, emoji: "👍" })).status).toBe(400);
      expect(ctx.saved.size).toBe(0);
    });

    test("another company's request reads none of this task's reactions", async () => {
      const ctx = fakeReactionContext();
      await write(ctx, { commentId: boardMessage.id, emoji: "✅", on: true });
      const request = reactionRequest(
        reactionsReadRouteKey,
        boardActor,
        null,
        chatTask.id,
        "other-company",
      );
      expect(await handleReactionsRead(request, ctx)).toEqual({
        status: 200,
        body: { reactions: {} },
      });
    });
  });

  test("adding a reaction the person already has changes nothing; a person may keep several emoji", () => {
    const change = { by: board, on: true, onlyOne: false, at: "t2" } as const;
    const first = applyReaction([], { ...change, emoji: "👍" });
    expect(applyReaction(first, { ...change, emoji: "👍" })).toBe(first);
    expect(applyReaction(first, { ...change, emoji: "❤️" }).map((one) => one.emoji)).toEqual([
      "👍",
      "❤️",
    ]);
  });
});
