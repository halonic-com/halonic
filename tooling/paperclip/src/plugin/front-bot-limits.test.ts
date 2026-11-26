import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { allowedLogFields } from "../front-bot/log-record.ts";
import { botOn, commentCreated, frontBotHarness } from "./front-bot.test-helper.ts";

const spendKey = JSON.stringify({
  scopeKind: "company",
  scopeId: "acme",
  namespace: "front-bot",
  stateKey: "spend",
});
const healthKey = JSON.stringify({
  scopeKind: "company",
  scopeId: "acme",
  namespace: "front-bot",
  stateKey: "health",
});

const reply = { reply: "About PR #6129. Depends on the merge queue." };

verifies("paperclip.front-bot-limits", () => {
  test("must-fail test 7: off by default, the bot makes no call and logs nothing", async () => {
    for (const config of [
      {},
      { ...botOn, frontBotEnabled: false },
      { ...botOn, frontBotEnabled: "true" },
    ]) {
      const harness = frontBotHarness({ config, answers: [reply] });
      await harness.bot.onCommentCreated(commentCreated(harness.message.id));
      expect(harness.requests).toEqual([]);
      expect(harness.posted()).toEqual([]);
      expect(harness.logs).toEqual([]);
    }
  });

  test("on without a key, it makes no call and says why", async () => {
    const harness = frontBotHarness({ config: { frontBotEnabled: true }, answers: [reply] });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.requests).toEqual([]);
    expect(harness.logs[0]?.meta).toMatchObject({ outcome: "not_called", reason: "no_key" });
  });

  test("must-fail test 7: at the $3 cap it makes no call until the next UTC day", async () => {
    const harness = frontBotHarness({ answers: [reply] });
    harness.saved.set(spendKey, { day: "2026-11-26", microUsd: 3_000_000, warned: true });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.requests).toEqual([]);
    expect(harness.logs[0]?.meta).toMatchObject({ outcome: "capped", reason: "cap_reached" });

    harness.saved.set(spendKey, { day: "2026-11-25", microUsd: 3_000_000, warned: true });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.requests).toHaveLength(1);
  });

  test("counts each call at Haiku 4.5's prices and tells Chief once at 80%", async () => {
    const harness = frontBotHarness({ answers: [reply, reply] });
    harness.saved.set(spendKey, { day: "2026-11-26", microUsd: 2_399_000, warned: false });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    // 1,800 tokens in at $1 and 40 out at $5 per million: $0.0020.
    expect(harness.saved.get(spendKey)).toEqual({
      day: "2026-11-26",
      microUsd: 2_401_000,
      warned: true,
    });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    const toChief = harness.comments.filter((comment) => comment.issueId === "task-chief");
    expect(toChief.map((comment) => comment.body)).toEqual([
      "Front bot: $2.40 spent today, 80% of the $3 daily cap. At $3 it stops until 00:00 UTC.",
    ]);
  });

  test("more than 1 in 5 failed calls stops it for 15 minutes", async () => {
    const harness = frontBotHarness({
      answers: [reply, { status: 500 }, reply, { status: 503 }, reply, reply],
    });
    for (let call = 0; call < 5; call += 1) {
      await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    }
    expect(harness.saved.get(healthKey)).toMatchObject({
      calls: [],
      stoppedUntil: expect.any(Number),
    });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.requests).toHaveLength(5);
    expect(harness.logs.at(-1)?.meta).toMatchObject({ outcome: "stopped", reason: "error_rate" });
  });

  test("must-fail test 10: every log record has only the allowed fields, and only fixed codes", async () => {
    const harness = frontBotHarness({
      answers: [reply, { reply: "PR #6129 is merged." }, { reply: "SKIP" }, { status: 529 }],
    });
    for (let call = 0; call < 4; call += 1) {
      await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    }
    expect(harness.logs).toHaveLength(4);
    for (const log of harness.logs) {
      const meta = log.meta as Record<string, unknown>;
      expect(
        Object.keys(meta).every((field) => (allowedLogFields as readonly string[]).includes(field)),
      ).toBe(true);
      expect(log.line).toMatch(/^Front bot: first reply (posted|rejected|skip|failed)\.$/);
    }
    expect(harness.logs.map((log) => (log.meta as Record<string, unknown>)["reason"])).toEqual([
      undefined,
      "result_word",
      undefined,
      "http_529",
    ]);
    expect(JSON.stringify(harness.logs)).not.toMatch(/merged yet|merge queue|is merged/);
  });
});
