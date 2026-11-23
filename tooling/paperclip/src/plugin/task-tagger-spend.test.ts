import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { costUsd, currentSpend } from "../task-tagger/spend.ts";
import {
  codeVerdict,
  haikuSays,
  tagEvent,
  taggedTask,
  taggerHarness,
} from "./task-tagger.test-helper.ts";

const spendKey = JSON.stringify({
  scopeKind: "company",
  scopeId: "acme",
  namespace: "tagger",
  stateKey: "spend",
});

verifies("paperclip.task-tagger-spend", () => {
  describe("the tagger's monthly spend guard", () => {
    test("prices a call from the tokens it reports", () => {
      expect(costUsd({ input_tokens: 2000, output_tokens: 100 })).toBeCloseTo(0.00025, 10);
      expect(costUsd(undefined)).toBe(0);
      expect(costUsd({ input_tokens: -5, output_tokens: Number.NaN })).toBe(0);
    });

    test("adds each call to the month's spend", async () => {
      const harness = taggerHarness(taggedTask());
      harness.answers.push(haikuSays(codeVerdict("D2")));
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      expect(harness.saved.get(spendKey)).toEqual({
        month: "2026-11",
        usd: costUsd({ input_tokens: 2000, output_tokens: 100 }),
        calls: 1,
        stopReported: false,
      });
    });

    test("stops at $5 for the month, reports it once, and starts again next month", async () => {
      const task = taggedTask();
      const harness = taggerHarness(task);
      harness.saved.set(spendKey, { month: "2026-11", usd: 5, calls: 20_000, stopReported: false });
      harness.answers.push(haikuSays(codeVerdict("D2")));
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      expect(harness.haikuCalls()).toEqual([]);
      expect(harness.logs).toEqual([
        {
          level: "warn",
          line: "Task tagger: stopped for the month, $5.00 of $5 in 2026-11 (20,000 calls).",
        },
      ]);
      expect(harness.written.map((metric) => metric.name)).toEqual(["task_tagger.limit_reached"]);
      harness.clock.now = new Date("2026-12-01T00:05:00Z");
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      expect(harness.haikuCalls()).toHaveLength(1);
      expect(harness.labels()).toEqual(["D2"]);
    });

    test("shows the spend and the stop as the plugin's health", async () => {
      const harness = taggerHarness(taggedTask());
      expect(await harness.tagger.health()).toEqual({
        status: "ok",
        message: "Task tagger (Haiku): Acme: tagging, $0.00 of $5 in 2026-11 (0 calls).",
        details: { taskTagger: ["Acme: tagging, $0.00 of $5 in 2026-11 (0 calls)"] },
      });
      harness.saved.set(spendKey, {
        month: "2026-11",
        usd: 5.01,
        calls: 20_040,
        stopReported: true,
      });
      const health = await harness.tagger.health();
      expect(health.status).toBe("degraded");
      expect(health.message).toBe(
        "Task tagger (Haiku): Acme: stopped for the month, $5.01 of $5 in 2026-11 (20,040 calls).",
      );
    });

    test("counts last month's spend as a fresh month", () => {
      const stored = { month: "2026-10", usd: 5, calls: 1, stopReported: true };
      expect(currentSpend(stored, new Date("2026-11-01T00:00:00Z"))).toEqual({
        month: "2026-11",
        usd: 0,
        calls: 0,
        stopReported: false,
      });
    });
  });
});
