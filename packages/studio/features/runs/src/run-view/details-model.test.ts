import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { SourcedRun } from "../api.ts";
import { minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { detailRows } from "./details-model.ts";

const context = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  currency: "EUR",
  now: mondayMorning,
};

function rowsOf(changes: Parameters<typeof summaryWith>[0]) {
  const run: SourcedRun = { summary: summaryWith(changes), madeToolCalls: false };
  return detailRows(run, context, undefined).map((row) => [row.label, row.value]);
}

verifies("runs.run-view.details", () => {
  it("lists a finished run's rows in order", () => {
    expect(
      rowsOf({
        status: "completed",
        trigger: { type: "manual" },
        endedAt: minutesLater(2.1667),
        usage: { inputTokens: 1204, outputTokens: 312 },
        cost: 0.03,
      }),
    ).toEqual([
      ["Started by", "You, with Run"],
      ["Started", "today 10:40"],
      ["Took", "2 min 10 s"],
      ["Model calls and tokens", "1,204 in · 312 out"],
      ["Estimated cost", "€0.03"],
    ]);
  });

  it("leaves out Took and the cost for a live run with no model call, and says None", () => {
    expect(rowsOf({})).toEqual([
      ["Started by", "You, in the terminal"],
      ["Started", "today 10:40"],
      ["Model calls and tokens", "None"],
    ]);
  });

  it("says the calls without a price when none had one, and adds them to an amount", () => {
    const usage = { inputTokens: 10, outputTokens: 5 };
    expect(rowsOf({ usage, unpricedCalls: 3 }).at(-1)).toEqual([
      "Estimated cost",
      "3 calls without a price",
    ]);
    expect(rowsOf({ usage, cost: 0.03, unpricedCalls: 2 }).at(-1)).toEqual([
      "Estimated cost",
      "€0.03 (+2 calls without a price)",
    ]);
  });

  it("shows no cost for calls that were all free", () => {
    const rows = rowsOf({ usage: { inputTokens: 10, outputTokens: 5 }, subscriptionCalls: 1 });
    expect(rows.map(([label]) => label)).not.toContain("Estimated cost");
  });
});
