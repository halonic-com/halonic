import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { answerWakeHold, readWakeHoldSettings, slidingHold } from "./wake-hold.ts";

/**
 * Front bot v2b (HAL-19315): the `wake-hold` data key the server's patch asks
 * before it wakes a chat's agent. The 300 ms wait and the 15 s cap are the
 * server's (halonic-com/server, wake-hold.test.mjs).
 */

const companyId = "acme";
const chatTaskId = "0b5c2f9e-4d1a-4c3b-9a8e-1f2d3c4b5a69";
const newestOwedAt = "2026-11-26T14:03:00.000Z";
const holdOn = { wakeHoldEnabled: true };

interface FakeTask {
  readonly id: string;
  readonly companyId: string;
  readonly conversationAgentId: string | null;
  readonly activeRun: { id: string } | null;
}

const chatTask: FakeTask = {
  id: chatTaskId,
  companyId,
  conversationAgentId: "agent-chief",
  activeRun: null,
};

/** A host with one company's settings and one task; it counts the task reads. */
function fakeHost(config: Record<string, unknown>, task: FakeTask | null = chatTask) {
  const reads: string[] = [];
  const ctx = {
    config: { get: async (company: string) => (company === companyId ? config : {}) },
    issues: {
      get: async (id: string, company: string) => {
        reads.push(id);
        return task !== null && task.id === id && company === companyId ? task : null;
      },
    },
  } as unknown as Parameters<typeof answerWakeHold>[0];
  return { ctx, reads };
}

/** Asks the data key `secondsLater` after the newest owed message. */
async function ask(
  config: Record<string, unknown>,
  secondsLater: number,
  task: FakeTask | null = chatTask,
  params: Record<string, unknown> = { companyId, issueId: chatTaskId, owedCount: 2, newestOwedAt },
) {
  const { ctx, reads } = fakeHost(config, task);
  const now = new Date(new Date(newestOwedAt).getTime() + secondsLater * 1_000);
  return { answer: await answerWakeHold(ctx, params, () => now), reads };
}

verifies("paperclip.wake-hold", () => {
  describe("off", () => {
    test("the setting off by default: wake now, without reading the task", async () => {
      const { answer, reads } = await ask({}, 0);
      expect(answer).toEqual({ wake: "now", reason: "setting wakeHoldEnabled is off" });
      expect(reads).toEqual([]);
    });

    test("only exactly true turns it on", async () => {
      expect((await ask({ wakeHoldEnabled: "true" }, 0)).answer.wake).toBe("now");
    });
  });

  describe("not one of our chat tasks", () => {
    test("an ordinary task: wake now", async () => {
      const { answer } = await ask(holdOn, 0, { ...chatTask, conversationAgentId: null });
      expect(answer).toEqual({ wake: "now", reason: "not one of this company's chat tasks" });
    });

    test("another company's task, or no task: wake now", async () => {
      const other = { ...chatTask, companyId: "other" };
      expect((await ask(holdOn, 0, other)).answer.wake).toBe("now");
      expect((await ask(holdOn, 0, null)).answer.wake).toBe("now");
    });
  });

  test("a live run on the task: wake now", async () => {
    const { answer } = await ask(holdOn, 0, { ...chatTask, activeRun: { id: "run-1" } });
    expect(answer).toEqual({ wake: "now", reason: "a run on the task is live" });
  });

  describe("the sliding hold", () => {
    test("the default 3 s, counted from the newest owed message and rounded up", async () => {
      expect((await ask(holdOn, 0)).answer).toEqual({ wake: "after", seconds: 3 });
      expect((await ask(holdOn, 1.2)).answer).toEqual({ wake: "after", seconds: 2 });
      expect((await ask(holdOn, 2.9)).answer).toEqual({ wake: "after", seconds: 1 });
    });

    test("held long enough: wake now", async () => {
      expect((await ask(holdOn, 3)).answer).toEqual({ wake: "now", reason: "the hold has passed" });
      expect((await ask(holdOn, 30)).answer.wake).toBe("now");
    });

    test("the board's hold is used", async () => {
      const { answer } = await ask({ ...holdOn, wakeHoldSeconds: 8 }, 0.5);
      expect(answer).toEqual({ wake: "after", seconds: 8 });
    });

    test("a newest message a little ahead of our clock still gives a whole-second hold", () => {
      const now = new Date(newestOwedAt);
      expect(slidingHold(3, new Date(now.getTime() + 500), now)).toEqual({
        wake: "after",
        seconds: 4,
      });
    });
  });

  describe("the clamp", () => {
    test("a whole number from 1 to 10 is kept", () => {
      expect(readWakeHoldSettings({ wakeHoldSeconds: 1 }).seconds).toBe(1);
      expect(readWakeHoldSettings({ wakeHoldSeconds: 10 }).seconds).toBe(10);
    });

    test("anything else counts as 3", () => {
      for (const seconds of [0, -1, 11, 2.5, "5", null, Number.NaN]) {
        expect(readWakeHoldSettings({ wakeHoldSeconds: seconds }).seconds).toBe(3);
      }
    });

    test("an answer is never under 1 s", () => {
      const now = new Date(new Date(newestOwedAt).getTime() + 2_999);
      expect(slidingHold(3, new Date(newestOwedAt), now)).toEqual({ wake: "after", seconds: 1 });
    });
  });

  test("missing or unreadable params: wake now", async () => {
    const reason = "companyId, issueId and newestOwedAt are required";
    expect((await ask(holdOn, 0, chatTask, { companyId })).answer).toEqual({ wake: "now", reason });
    const bad = { companyId, issueId: chatTaskId, newestOwedAt: "yesterday" };
    expect((await ask(holdOn, 0, chatTask, bad)).answer).toEqual({ wake: "now", reason });
  });
});
