import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  choiceFor,
  choiceMaxAgeMs,
  matchChoice,
  runChoiceInstruction,
  splitRunLine,
} from "../front-bot/run-choice.ts";
import { botOn, chatTaskId, commentCreated, frontBotHarness } from "./front-bot.test-helper.ts";
import {
  answerRunChoice,
  pendingMessages,
  pendingWaitMs,
  storeRunChoice,
} from "./front-bot-run-choice.ts";

/**
 * Front bot v2 (HAL-19219): the first-reply call's run choice, stored for the
 * server's run-start hook. Every model reply is recorded; nothing reaches the
 * network. The never-raise rule and the model allowlist are the server's
 * (halonic-com/server, run-choice.test.mjs); here the plugin never lets the
 * model name a model or an effort.
 */

const reply = "About PR #6129. Checking the merge queue.";
const choiceOn = { ...botOn, frontBotRunChoice: true };

/** Runs one message through the bot with the recorded answer, then asks the data key for it. */
async function askAfter(answer: string, config: Record<string, unknown> = choiceOn) {
  const harness = frontBotHarness({ answers: [{ reply: answer }], config });
  await harness.bot.onCommentCreated(commentCreated(harness.message.id));
  const params = { companyId: "acme", issueId: chatTaskId, commentId: harness.message.id };
  const result = await answerRunChoice(harness.ctx, pendingMessages(), params);
  return { harness, result };
}

/** The system prompt the bot sent. */
function systemPrompt(requests: { body: string }[]): string {
  return (JSON.parse(requests[0]?.body ?? "{}") as { system: string }).system;
}

afterEach(() => {
  vi.useRealTimers();
});

verifies("paperclip.front-bot-run-choice", () => {
  describe("the run line", () => {
    test("only the last line counts, and it is taken off the reply", () => {
      expect(splitRunLine(`${reply}\nRun: quick`)).toEqual({ reply, run: "quick" });
      expect(splitRunLine(`SKIP\nrun: NORMAL\n`)).toEqual({ reply: "SKIP", run: "normal" });
    });

    test("no run line, or one that isn't last, is a normal run", () => {
      expect(splitRunLine(reply)).toEqual({ reply, run: "normal" });
      expect(splitRunLine(`Run: quick\n${reply}`).run).toBe("normal");
      expect(splitRunLine(`${reply}\nRun: quick please`).run).toBe("normal");
    });

    test("a quick run gets the board's settings, never anything from the model", () => {
      expect(choiceFor("quick", { effort: "low", model: undefined })).toEqual({ effort: "low" });
      expect(choiceFor("quick", { effort: "minimal", model: "m" })).toEqual({
        effort: "minimal",
        model: "m",
      });
      expect(choiceFor("normal", { effort: "low", model: "m" })).toBeUndefined();
    });
  });

  describe("stored by the first-reply call, read by the data key", () => {
    test("a quick message: the reply is posted as before and the choice is stored", async () => {
      const { harness, result } = await askAfter(`${reply}\nRun: quick`);
      expect(harness.posted().map((comment) => comment.body)).toEqual([`*Assistant:* ${reply}`]);
      expect(systemPrompt(harness.requests)).toContain(runChoiceInstruction);
      expect(result).toEqual({ choice: { effort: "low" } });
    });

    test("the board's quick effort and model are used", async () => {
      const config = { ...choiceOn, frontBotQuickEffort: "minimal", frontBotQuickModel: "m-1" };
      const { result } = await askAfter(`${reply}\nRun: quick`, config);
      expect(result).toEqual({ choice: { effort: "minimal", model: "m-1" } });
    });

    test("a quick effort that isn't a lowering level falls back to low", async () => {
      const { result } = await askAfter(`${reply}\nRun: quick`, {
        ...choiceOn,
        frontBotQuickEffort: "max",
      });
      expect(result).toEqual({ choice: { effort: "low" } });
    });

    test("a normal message stores no choice", async () => {
      const { result } = await askAfter(`${reply}\nRun: normal`);
      expect(result).toEqual({ choice: null, reason: "normal run" });
    });

    test("a SKIP still stores its choice", async () => {
      const { harness, result } = await askAfter("SKIP\nRun: quick");
      expect(harness.posted()).toEqual([]);
      expect(result).toEqual({ choice: { effort: "low" } });
    });

    test("setting off: the prompt has no run rule, nothing is stored, the answer says why", async () => {
      const { harness, result } = await askAfter(`${reply}\nRun: quick`, botOn);
      expect(systemPrompt(harness.requests)).not.toContain(runChoiceInstruction);
      expect(harness.posted().map((comment) => comment.body)).toEqual([`*Assistant:* ${reply}`]);
      expect([...harness.saved.keys()].some((key) => key.includes("run-choice"))).toBe(false);
      expect(result).toEqual({ choice: null, reason: "setting frontBotRunChoice is off" });
    });

    test("the bot off: the answer is off too", async () => {
      const harness = frontBotHarness({ config: { ...choiceOn, frontBotEnabled: false } });
      const params = { companyId: "acme", issueId: chatTaskId, commentId: harness.message.id };
      expect(await answerRunChoice(harness.ctx, pendingMessages(), params)).toEqual({
        choice: null,
        reason: "setting frontBotRunChoice is off",
      });
    });
  });

  describe("only this message's fresh choice", () => {
    const now = new Date("2026-11-26T14:10:00Z");
    const stored = {
      commentId: "c-1",
      at: "2026-11-26T14:03:00Z",
      choice: { effort: "low" as const },
    };

    test("another message's choice is not used", () => {
      expect(matchChoice(stored, "c-2", now)).toEqual({
        choice: null,
        reason: "the stored choice is for another message",
      });
    });

    test("a choice older than 10 minutes is not used", () => {
      const later = new Date(new Date(stored.at).getTime() + choiceMaxAgeMs + 1);
      expect(matchChoice(stored, "c-1", later).reason).toBe("the stored choice is too old");
      expect(matchChoice(stored, "c-1", now)).toEqual({ choice: { effort: "low" } });
    });

    test("nothing stored", () => {
      expect(matchChoice(null, "c-1", now).reason).toBe("no choice stored for this task");
    });

    test("missing params", async () => {
      const harness = frontBotHarness({ config: choiceOn });
      expect(await answerRunChoice(harness.ctx, pendingMessages(), { companyId: "acme" })).toEqual({
        choice: null,
        reason: "companyId, issueId and commentId are required",
      });
    });
  });

  describe("waiting for a message still in work, within the server's 1.5 s", () => {
    test("the wait stays under the server's limit", () => {
      expect(pendingWaitMs).toBeLessThan(1_500);
    });

    test("a message that finishes in time: its choice is answered", async () => {
      vi.useFakeTimers();
      const harness = frontBotHarness({ config: choiceOn });
      const pending = pendingMessages();
      let finish = () => {};
      pending.track("c-1", new Promise<void>((resolve) => (finish = resolve)));
      const params = { companyId: "acme", issueId: chatTaskId, commentId: "c-1" };
      const answer = answerRunChoice(
        harness.ctx,
        pending,
        params,
        () => new Date("2026-11-26T14:03:01Z"),
      );
      await vi.advanceTimersByTimeAsync(300);
      await storeRunChoice(harness.ctx.state, chatTaskId, {
        commentId: "c-1",
        at: "2026-11-26T14:03:00Z",
        choice: { effort: "low" },
      });
      finish();
      expect(await answer).toEqual({ choice: { effort: "low" } });
    });

    test("a message that never finishes: the answer comes after 1.2 s with no choice", async () => {
      vi.useFakeTimers();
      const harness = frontBotHarness({ config: choiceOn });
      const pending = pendingMessages();
      pending.track("c-1", new Promise<void>(() => {}));
      let settled = false;
      const params = { companyId: "acme", issueId: chatTaskId, commentId: "c-1" };
      const answer = answerRunChoice(harness.ctx, pending, params).then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(pendingWaitMs - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await answer).toEqual({ choice: null, reason: "no choice stored for this task" });
    });
  });
});
