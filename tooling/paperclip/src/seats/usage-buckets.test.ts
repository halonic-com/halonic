import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Placement } from "./records.ts";
import { bucketStart, type CostRow, seatAt, usageBuckets } from "./usage-buckets.ts";

function row(time: string, overrides: Partial<CostRow> = {}): CostRow {
  return {
    agentId: "agent-1",
    runId: "run-1",
    model: "claude-model-a",
    occurredAt: `2026-11-22T${time}:00.000Z`,
    inputTokens: 100,
    cachedInputTokens: 1000,
    outputTokens: 10,
    ...overrides,
  };
}

const placements: Placement[] = [
  {
    agentId: "agent-1",
    seatId: "seat-a",
    from: "2026-11-22T08:00:00.000Z",
    to: "2026-11-22T09:05:00.000Z",
    source: "observed",
  },
  {
    agentId: "agent-1",
    seatId: "seat-b",
    from: "2026-11-22T09:05:00.000Z",
    to: undefined,
    source: "board",
  },
];

verifies("paperclip.seats-usage-buckets", () => {
  test("a bucket starts on the UTC ten minutes", () => {
    expect(bucketStart("2026-11-22T09:07:59.999Z")).toBe("2026-11-22T09:00:00.000Z");
    expect(bucketStart("2026-11-22T09:10:00.000Z")).toBe("2026-11-22T09:10:00.000Z");
  });

  test("the seat is the one the agent was on at that time", () => {
    expect(seatAt(placements, "agent-1", "2026-11-22T09:04:59.000Z")).toBe("seat-a");
    expect(seatAt(placements, "agent-1", "2026-11-22T09:05:00.000Z")).toBe("seat-b");
    expect(seatAt(placements, "agent-1", "2026-11-22T07:59:00.000Z")).toBeUndefined();
    expect(seatAt(placements, "agent-2", "2026-11-22T09:00:00.000Z")).toBeUndefined();
  });

  test("rows in one bucket on one seat and model add up, counting each run once", () => {
    const rows = [row("08:21"), row("08:24"), row("08:29", { runId: "run-2" })];
    expect(usageBuckets(rows, placements)).toEqual([
      {
        agentId: "agent-1",
        seatId: "seat-a",
        model: "claude-model-a",
        bucketStart: "2026-11-22T08:20:00.000Z",
        inputTokens: 300,
        cachedInputTokens: 3000,
        outputTokens: 30,
        runs: 2,
      },
    ]);
  });

  test("a move inside a bucket splits it into one row per seat", () => {
    const rows = [row("09:02"), row("09:08", { runId: "run-2" })];
    expect(usageBuckets(rows, placements).map((usage) => [usage.seatId, usage.runs])).toEqual([
      ["seat-a", 1],
      ["seat-b", 1],
    ]);
  });

  test("models, agents and buckets stay apart, sorted by bucket first", () => {
    const rows = [
      row("08:45", { agentId: "agent-2" }),
      row("08:31", { model: "claude-model-b" }),
      row("08:32"),
    ];
    expect(
      usageBuckets(rows, placements).map((usage) => [
        usage.bucketStart.slice(11, 16),
        usage.agentId,
        usage.seatId,
        usage.model,
      ]),
    ).toEqual([
      ["08:30", "agent-1", "seat-a", "claude-model-a"],
      ["08:30", "agent-1", "seat-a", "claude-model-b"],
      ["08:40", "agent-2", undefined, "claude-model-a"],
    ]);
  });
});
