import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { answer, tagEvent, taggedTask, taggerHarness } from "./difficulty-tagger.test-helper.ts";

const spendKey = JSON.stringify({
  scopeKind: "company",
  scopeId: "acme",
  namespace: "tagger",
  stateKey: "spend",
});

verifies("paperclip.difficulty-tagger-spend", () => {
  test("counts an answer's tokens and still labels just under the limit", async () => {
    const task = taggedTask([]);
    const { tagger, saved, labels } = taggerHarness(task, [
      { ...answer("code", "D2", false), inputTokens: 1000, outputTokens: 40 },
    ]);
    saved.set(spendKey, { month: "2026-11", microUsd: 4_999_900, stopReported: false });
    await tagger.onIssueEvent(tagEvent("issue.created"));
    expect(labels()).toEqual(["D2"]);
    expect(saved.get(spendKey)).toEqual({
      month: "2026-11",
      microUsd: 5_000_020,
      stopReported: false,
    });
  });

  test("past $5 it makes no call and reports the stop once a month", async () => {
    const task = taggedTask([]);
    const { tagger, saved, asked, logs, written } = taggerHarness(task, []);
    saved.set(spendKey, { month: "2026-11", microUsd: 5_001_100, stopReported: false });
    await tagger.onIssueEvent(tagEvent("issue.created"));
    task.title = "Another title";
    await tagger.onIssueEvent(tagEvent());
    expect(asked).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.level).toBe("error");
    expect(logs[0]?.line).toMatch(/^Difficulty tagger: stopped for 2026-11, spend \$5\.00 /);
    expect(written).toEqual([
      {
        name: "difficulty_tagger.stopped",
        value: 1,
        tags: { companyId: "acme", month: "2026-11" },
      },
    ]);
  });

  test("starts again from $0 in a new month", async () => {
    const { tagger, saved, asked, clock } = taggerHarness(taggedTask([]), [
      answer("code", "D1", false),
    ]);
    saved.set(spendKey, { month: "2026-11", microUsd: 5_001_100, stopReported: true });
    clock.now = new Date("2026-12-01T00:05:00Z");
    await tagger.onIssueEvent(tagEvent("issue.created"));
    expect(asked).toHaveLength(1);
    expect(saved.get(spendKey)).toEqual({ month: "2026-12", microUsd: 110, stopReported: false });
  });

  test("counts two tasks tagged at once from each other's total", async () => {
    const { tagger, saved, asked, addTask } = taggerHarness(taggedTask([]), [
      answer("code", "D1", false),
      answer("code", "D2", false),
    ]);
    addTask(taggedTask([], { id: "task-2", identifier: "HAL-2", title: "Another task" }));
    await Promise.all([
      tagger.onIssueEvent(tagEvent("issue.created")),
      tagger.onIssueEvent(tagEvent("issue.created", "task-2")),
    ]);
    expect(asked).toHaveLength(2);
    expect(saved.get(spendKey)).toEqual({
      month: "2026-11",
      microUsd: 2 * 110,
      stopReported: false,
    });
  });
});
