import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test, vi } from "vitest";
import {
  chatTaskId,
  commentCreated,
  type FrontBotExample,
  frontBotHarness,
  plantedKey,
} from "./front-bot.test-helper.ts";

/** The recorded examples in `src/front-bot/examples/<name>.json`. */
function examples(name: string): FrontBotExample[] {
  const url = new URL(`../front-bot/examples/${name}.json`, import.meta.url);
  return (JSON.parse(readFileSync(url, "utf8")) as { cases: FrontBotExample[] }).cases;
}

/** Runs one recorded example through the bot, end to end. */
async function runExample(example: FrontBotExample) {
  const harness = frontBotHarness({
    title: example.title,
    earlier: example.earlier,
    message: example.message,
    answers: [{ reply: example.reply }],
    ...(example.memory === undefined ? {} : { memory: example.memory }),
  });
  await harness.bot.onCommentCreated(commentCreated(harness.message.id));
  return harness;
}

/** The one log record the bot wrote, as its metadata. */
function onlyRecord(logs: { meta: unknown }[]): Record<string, unknown> {
  expect(logs).toHaveLength(1);
  return logs[0]?.meta as Record<string, unknown>;
}

verifies("paperclip.front-bot-first-reply", () => {
  describe("each recorded reply is posted line by line, labelled as the assistant's, with no author", () => {
    for (const example of examples("voice").filter((each) => each.expect === "posted")) {
      test(example.name, async () => {
        const { posted, requests, logs } = await runExample(example);
        expect(requests).toHaveLength(1);
        expect(posted().map((comment) => comment.body)).toEqual(
          example.reply.split("\n").map((line) => `*Assistant:* ${line}`),
        );
        expect(onlyRecord(logs)["outcome"]).toBe("posted");
      });
    }
  });

  describe("must-fail tests 1, 2 and 4: a rejected reply posts nothing and logs only its code", () => {
    for (const example of examples("must-fail")) {
      test(example.name, async () => {
        const { posted, logs } = await runExample(example);
        expect(posted()).toEqual([]);
        expect(onlyRecord(logs)).toMatchObject({ outcome: "rejected", reason: example.reason });
        for (const line of example.reply.split("\n")) {
          expect(JSON.stringify(logs)).not.toContain(line);
        }
      });
    }
  });

  test("a SKIP answer posts nothing", async () => {
    const skip = examples("voice").find((each) => each.expect === "skip") as FrontBotExample;
    const { posted, logs } = await runExample(skip);
    expect(posted()).toEqual([]);
    expect(onlyRecord(logs)["outcome"]).toBe("skip");
  });

  test("a note that is posted but whose id isn't saved is logged as posted, with its own code", async () => {
    const example = examples("voice").find((each) => each.expect === "posted") as FrontBotExample;
    const harness = frontBotHarness({
      title: example.title,
      earlier: example.earlier,
      message: example.message,
      answers: [{ reply: example.reply }],
    });
    const set = harness.ctx.state.set.bind(harness.ctx.state);
    harness.ctx.state.set = async (key, value) => {
      if (JSON.stringify(key).includes("notes")) throw new Error("state store down");
      return set(key, value);
    };
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.posted()).toHaveLength(example.reply.split("\n").length);
    expect(onlyRecord(harness.logs)).toMatchObject({ outcome: "posted", reason: "note_unsaved" });
  });

  test("the request goes to the Messages API for Haiku 4.5, with comments quoted as data", async () => {
    const { requests } = await runExample(examples("voice")[0] as FrontBotExample);
    const request = requests[0];
    expect(request?.url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(request?.body ?? "{}") as {
      model: string;
      messages: { content: string }[];
    };
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.messages[0]?.content).toContain(
      'Comment by Liam at 13:52 UTC:\n"""\nLiam: approved on head abc1234\n"""',
    );
  });

  test("must-fail test 3: no call once the chat's agent answered", async () => {
    const harness = frontBotHarness({ answers: [{ reply: "About PR #6129." }] });
    harness.addComment({
      authorAgentId: "agent-chief",
      authorUserId: null,
      body: "Not merged yet.",
      createdAt: new Date("2026-11-26T14:03:05Z"),
    });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.requests).toEqual([]);
    expect(onlyRecord(harness.logs)).toMatchObject({
      outcome: "not_called",
      reason: "agent_answered",
    });
  });

  test("must-fail test 3: a reply that arrives after the agent's answer is not posted", async () => {
    const harness = frontBotHarness({
      answers: [{ reply: "About PR #6129. Checking the merge queue." }],
      agentAnswersDuringCall: true,
    });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.posted()).toEqual([]);
    expect(onlyRecord(harness.logs)).toMatchObject({
      outcome: "rejected",
      reason: "agent_answered",
    });
  });

  test("must-fail test 5: the planted key is only ever in the key header", async () => {
    const harness = frontBotHarness({ answers: [{ reply: "About PR #6129." }, { status: 401 }] });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    const second = harness.addComment({
      authorAgentId: null,
      authorUserId: "user-board",
      body: "and #6129's checks?",
      createdAt: new Date("2026-11-26T14:04:00Z"),
    });
    await harness.bot.onCommentCreated(commentCreated(second.id));
    expect(harness.requests.map((request) => request.headers["x-api-key"])).toEqual([
      plantedKey,
      plantedKey,
    ]);
    const everythingElse = JSON.stringify([
      harness.requests.map((request) => request.body),
      harness.logs,
      harness.written,
      harness.comments,
      [...harness.saved.values()],
    ]);
    expect(everythingElse).not.toContain(plantedKey);
    expect(everythingElse).not.toContain("upstream said");
  });

  test("must-fail test 5: a message shaped like a key makes no call, and such a comment is left out", async () => {
    const withKey = frontBotHarness({
      message: `use ${plantedKey}`,
      answers: [{ reply: "About it." }],
    });
    await withKey.bot.onCommentCreated(commentCreated(withKey.message.id));
    expect(withKey.requests).toEqual([]);
    expect(onlyRecord(withKey.logs)).toMatchObject({
      outcome: "not_called",
      reason: "secret_in_input",
    });

    const earlierKey = frontBotHarness({
      earlier: [{ author: "board", at: "2026-11-26T13:00:00Z", body: `the key is ${plantedKey}` }],
      answers: [{ reply: "SKIP" }],
    });
    await earlierKey.bot.onCommentCreated(commentCreated(earlierKey.message.id));
    expect(earlierKey.requests).toHaveLength(1);
    expect(earlierKey.requests[0]?.body).not.toContain(plantedKey);
  });

  describe("must-fail test 5: keys Studio's check doesn't know are caught too", () => {
    // Built at run time, so the source holds no text shaped like a key.
    const shapes = {
      "a signed token (JWT)": [
        `eyJ${"aGVsbG8gd29y".repeat(2)}`,
        `eyJ${"c3ViIjoiYWNt".repeat(2)}`,
        "Q7x2Lm9K".repeat(4),
      ].join("."),
      "a GitHub app token": `ghs_${"Q7x2Lm9K".repeat(5)}`,
    };
    for (const [kind, fake] of Object.entries(shapes)) {
      test(`${kind} in the message makes no call`, async () => {
        const harness = frontBotHarness({ message: `use ${fake}`, answers: [{ reply: "SKIP" }] });
        await harness.bot.onCommentCreated(commentCreated(harness.message.id));
        expect(harness.requests).toEqual([]);
        expect(onlyRecord(harness.logs)).toMatchObject({ reason: "secret_in_input" });
      });

      test(`${kind} in an earlier comment is left out`, async () => {
        const harness = frontBotHarness({
          earlier: [{ author: "board", at: "2026-11-26T13:00:00Z", body: `token: ${fake}` }],
          answers: [{ reply: "SKIP" }],
        });
        await harness.bot.onCommentCreated(commentCreated(harness.message.id));
        expect(harness.requests).toHaveLength(1);
        expect(harness.requests[0]?.body).not.toContain(fake);
      });
    }
  });

  test("the call never follows a redirect, which would take the key to another host", async () => {
    const harness = frontBotHarness({ answers: [{ reply: "SKIP" }] });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.requests.map((request) => request.redirect)).toEqual(["error"]);
  });

  test("a call that never answers ends at the timeout and frees the queue", async () => {
    vi.useFakeTimers();
    try {
      const harness = frontBotHarness({
        answers: [{ hangs: true }, { reply: "About PR #6129. Checking the merge queue." }],
      });
      const first = harness.bot.onCommentCreated(commentCreated(harness.message.id));
      await vi.advanceTimersByTimeAsync(8_000);
      await first;
      expect(onlyRecord(harness.logs)).toMatchObject({ outcome: "failed", reason: "timeout" });

      const second = harness.addComment({
        authorAgentId: null,
        authorUserId: "user-board",
        body: "Is #6129 merged yet?",
        createdAt: new Date("2026-11-26T14:04:00Z"),
      });
      await harness.bot.onCommentCreated(commentCreated(second.id));
      expect(harness.posted()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("must-fail test 6: out-of-scope comments make no call", async () => {
    const agentComment = frontBotHarness({ answers: [{ reply: "About PR #6129." }] });
    const byAgent = agentComment.addComment({
      authorAgentId: "agent-liam",
      authorUserId: null,
      body: "Is #6129 merged yet?",
      createdAt: new Date("2026-11-26T14:04:00Z"),
    });
    await agentComment.bot.onCommentCreated(commentCreated(byAgent.id));
    const systemComment = agentComment.addComment({
      authorAgentId: null,
      authorUserId: null,
      body: "Run failed.",
      createdAt: new Date("2026-11-26T14:05:00Z"),
    });
    await agentComment.bot.onCommentCreated(commentCreated(systemComment.id));
    await agentComment.bot.onCommentCreated(
      commentCreated(agentComment.message.id, "other-company"),
    );
    expect(agentComment.requests).toEqual([]);

    const notChat = frontBotHarness({
      conversationAgentId: null,
      answers: [{ reply: "About PR #6129." }],
    });
    await notChat.bot.onCommentCreated(commentCreated(notChat.message.id));
    expect(notChat.requests).toEqual([]);
    expect([...agentComment.logs, ...notChat.logs]).toEqual([]);
  });

  test("must-fail test 8: an API failure or a network error shows nothing", async () => {
    const harness = frontBotHarness({ answers: [{ status: 500 }, { throws: "TimeoutError" }] });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.posted()).toEqual([]);
    expect(harness.logs.map((log) => (log.meta as Record<string, unknown>)["reason"])).toEqual([
      "http_500",
      "timeout",
    ]);
  });

  test("must-fail test 9: the bot's own comment doesn't start the bot again", async () => {
    const harness = frontBotHarness({
      answers: [{ reply: "About PR #6129." }, { reply: "About PR #6129." }],
    });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    const note = harness.posted()[0];
    expect(note?.body).toBe("*Assistant:* About PR #6129.");
    await harness.bot.onCommentCreated(commentCreated(note?.id ?? ""));
    expect(harness.requests).toHaveLength(1);
    expect(harness.saved.get(JSON.stringify(notesKey))).toEqual({
      companyId: "acme",
      notes: [{ commentId: note?.id, runId: "run-1", at: expect.any(String) }],
    });
  });
});

const notesKey = {
  scopeKind: "issue",
  scopeId: chatTaskId,
  namespace: "front-bot",
  stateKey: "notes",
};
