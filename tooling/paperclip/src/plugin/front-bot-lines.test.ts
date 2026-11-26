import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { chiefId, commentCreated, frontBotHarness } from "./front-bot.test-helper.ts";
import { lineDelayMs } from "./front-bot.ts";

/**
 * A first reply of several chat lines (HAL-19588): each line is its own
 * comment, with a short typing pause before each later one, and the agent's
 * answer stops the lines not yet posted.
 */

/** The one log record the bot wrote, as its metadata. */
function onlyRecord(logs: { meta: unknown }[]): Record<string, unknown> {
  expect(logs).toHaveLength(1);
  return logs[0]?.meta as Record<string, unknown>;
}

verifies("paperclip.front-bot-first-reply", () => {
  test("each line is its own comment, with a typing pause before each later one", async () => {
    const harness = frontBotHarness({
      message: "the links on the docs page are broken again",
      answers: [{ reply: "Ah, annoying\nOn it\nLooking into the docs links now" }],
    });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.posted().map((comment) => comment.body)).toEqual([
      "*Assistant:* Ah, annoying",
      "*Assistant:* On it",
      "*Assistant:* Looking into the docs links now",
    ]);
    expect(harness.pauses).toEqual([
      lineDelayMs("On it"),
      lineDelayMs("Looking into the docs links now"),
    ]);
    expect(onlyRecord(harness.logs)["outcome"]).toBe("posted");
  });

  test("the latency ends at the first line, so the pauses before later lines don't count", async () => {
    const latencyOf = async (reply: string) => {
      const harness = frontBotHarness({ answers: [{ reply }] });
      await harness.bot.onCommentCreated(commentCreated(harness.message.id));
      return onlyRecord(harness.logs)["latencyMs"];
    };
    expect(await latencyOf("On it\nLooking into the docs links now")).toBe(await latencyOf("On it"));
  });

  test("a pause is 0.7 s and a bit per character, at most 2.5 s", () => {
    expect(lineDelayMs("On it")).toBe(875);
    expect(lineDelayMs("x".repeat(200))).toBe(2_500);
  });

  test("when the agent answers during a pause, the lines not yet posted stay unposted", async () => {
    const harness = frontBotHarness({
      answers: [{ reply: "Good question\nChecking the queue for #6129" }],
      onPause: () => {
        harness.addComment({
          authorAgentId: chiefId,
          authorUserId: null,
          body: "In the queue, third in line.",
          createdAt: new Date("2026-11-26T14:03:05Z"),
        });
      },
    });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.posted().map((comment) => comment.body)).toEqual(["*Assistant:* Good question"]);
    expect(onlyRecord(harness.logs)["outcome"]).toBe("posted");
  });

  test("one bad line rejects the whole reply, so its good lines aren't posted either", async () => {
    const harness = frontBotHarness({ answers: [{ reply: "On it\nAlready merged" }] });
    await harness.bot.onCommentCreated(commentCreated(harness.message.id));
    expect(harness.posted()).toEqual([]);
    expect(onlyRecord(harness.logs)).toMatchObject({ outcome: "rejected", reason: "result_word" });
  });
});
