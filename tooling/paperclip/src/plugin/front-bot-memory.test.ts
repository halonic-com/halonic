import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { describe, expect, test } from "vitest";
import { fakeState } from "./fake-host.test-helper.ts";
import {
  boardUserId,
  botOn,
  chatTaskId,
  commentCreated,
  companyId,
  frontBotHarness,
  plantedKey,
} from "./front-bot.test-helper.ts";
import {
  chatMemoryClearRouteKey,
  chatMemoryRouteKey,
  handleChatMemory,
  readMemory,
  writeMemory,
} from "./front-bot-memory.ts";

const remembered = {
  summary: "Asked about the 0.3 release notes earlier.",
  notes: ["Likes short answers."],
};

const update =
  "SUMMARY: Asked about #6129 and the 0.3 notes.\nNOTE: Likes short answers.\nNOTE: Follows #6129.";

/** One message through the bot with memory on: a two-line reply, then the memory call's answer. */
async function exchange(memoryAnswer: { reply: string } | { status: number } = { reply: update }) {
  const harness = frontBotHarness({
    memory: remembered,
    answers: [{ reply: "Good question\nChecking the queue for #6129" }, memoryAnswer],
  });
  await harness.bot.onCommentCreated(commentCreated(harness.message.id));
  return harness;
}

function memoryRequest(
  routeKey: string,
  actor: PluginApiRequestInput["actor"],
  taskId = chatTaskId,
  company = companyId,
) {
  return {
    routeKey,
    method: routeKey === chatMemoryClearRouteKey ? "DELETE" : "GET",
    path: `/chat-memory/${taskId}`,
    params: { taskId },
    query: { companyId: company },
    body: null,
    actor,
    companyId: company,
    headers: {},
  } as unknown as PluginApiRequestInput;
}

const board = {
  actorType: "user",
  actorId: boardUserId,
  userId: boardUserId,
} as PluginApiRequestInput["actor"];
const agent = {
  actorType: "agent",
  actorId: "agent-liam",
  agentId: "agent-liam",
} as PluginApiRequestInput["actor"];

verifies("paperclip.front-bot-memory", () => {
  describe("the summary and notes are updated after an exchange and never during a reply", () => {
    test("the reply reads the memory as quoted data, with no call before it", async () => {
      const { requests } = await exchange();
      const replyText = JSON.parse(requests[0]?.body ?? "{}").messages[0].content as string;
      expect(replyText).toContain(remembered.summary);
      expect(replyText).toContain(remembered.notes[0]);
      expect(requests).toHaveLength(2);
    });

    test("the memory call comes only once every line of the reply is posted", async () => {
      const { postedAtRequest, posted } = await exchange();
      expect(posted()).toHaveLength(2);
      expect(postedAtRequest).toEqual([0, 2]);
    });

    test("after the exchange, the summary and the board user's notes hold the update", async () => {
      const { ctx, logs } = await exchange();
      expect(await readMemory(ctx.state, companyId, chatTaskId, boardUserId)).toEqual({
        summary: "Asked about #6129 and the 0.3 notes.",
        notes: ["Likes short answers.", "Follows #6129."],
      });
      expect(logs.map((log) => (log.meta as Record<string, unknown>)["callType"])).toEqual([
        "first_reply",
        "memory",
      ]);
    });

    test("a failed memory call keeps the old memory", async () => {
      const { ctx } = await exchange({ status: 500 });
      expect(await readMemory(ctx.state, companyId, chatTaskId, boardUserId)).toEqual(remembered);
    });

    test("a rejected reply posts nothing and updates nothing", async () => {
      const harness = frontBotHarness({
        memory: remembered,
        answers: [{ reply: "PR #6129 is merged." }],
      });
      await harness.bot.onCommentCreated(commentCreated(harness.message.id));
      expect(harness.requests).toHaveLength(1);
      expect(await readMemory(harness.ctx.state, companyId, chatTaskId, boardUserId)).toEqual(
        remembered,
      );
    });

    test("with memory off, nothing is read into the reply and no memory call is made", async () => {
      const harness = frontBotHarness({
        config: botOn,
        answers: [{ reply: "Good question\nChecking the queue for #6129" }],
      });
      await writeMemory(harness.ctx.state, companyId, chatTaskId, boardUserId, remembered);
      await harness.bot.onCommentCreated(commentCreated(harness.message.id));
      expect(harness.requests).toHaveLength(1);
      expect(harness.requests[0]?.body).not.toContain(remembered.summary);
    });
  });

  describe("a key-shaped value is never stored", () => {
    test("a note or summary shaped like a key from the memory call is dropped", async () => {
      const leaky = `SUMMARY: The key is ${plantedKey}\nNOTE: Likes short answers.\nNOTE: Uses ${plantedKey}`;
      const { ctx, saved } = await exchange({ reply: leaky });
      expect(await readMemory(ctx.state, companyId, chatTaskId, boardUserId)).toEqual({
        summary: "",
        notes: ["Likes short answers."],
      });
      expect(JSON.stringify([...saved.values()])).not.toContain(plantedKey);
    });

    test("a direct write drops a key-shaped part too", async () => {
      const { state, saved } = fakeState();
      await writeMemory(state, companyId, chatTaskId, boardUserId, {
        summary: `Pasted ${plantedKey}`,
        notes: [plantedKey, "Names the release card the card"],
      });
      expect(JSON.stringify([...saved.values()])).not.toContain(plantedKey);
    });
  });

  describe("the board reads and clears the memory on its own route", () => {
    test("clear empties both the summary and the notes", async () => {
      const { state } = fakeState();
      await writeMemory(state, companyId, chatTaskId, boardUserId, remembered);
      expect(await handleChatMemory(memoryRequest(chatMemoryRouteKey, board), { state })).toEqual({
        status: 200,
        body: remembered,
      });
      expect(
        (await handleChatMemory(memoryRequest(chatMemoryClearRouteKey, board), { state })).status,
      ).toBe(200);
      expect(await readMemory(state, companyId, chatTaskId, boardUserId)).toEqual({
        summary: "",
        notes: [],
      });
    });

    test("anyone but the board gets 403, and nothing is cleared", async () => {
      const { state } = fakeState();
      await writeMemory(state, companyId, chatTaskId, boardUserId, remembered);
      for (const key of [chatMemoryRouteKey, chatMemoryClearRouteKey]) {
        expect((await handleChatMemory(memoryRequest(key, agent), { state })).status).toBe(403);
      }
      expect(await readMemory(state, companyId, chatTaskId, boardUserId)).toEqual(remembered);
    });

    test("another company reads nothing, and an odd task id is 404", async () => {
      const { state } = fakeState();
      await writeMemory(state, companyId, chatTaskId, boardUserId, remembered);
      const other = memoryRequest(chatMemoryRouteKey, board, chatTaskId, "other-company");
      expect((await handleChatMemory(other, { state })).body).toEqual({ summary: "", notes: [] });
      const odd = memoryRequest(chatMemoryRouteKey, board, "../other");
      expect((await handleChatMemory(odd, { state })).status).toBe(404);
    });
  });
});
