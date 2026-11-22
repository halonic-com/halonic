import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunEventBody } from "./run-event.ts";
import { summaryOf } from "./summarize.test-helper.ts";
import { parseEventLine } from "./upgrade.ts";

type HarnessStopped = Extract<RunEventBody, { type: "harness.stopped" }>;

const stopped: HarnessStopped = {
  type: "harness.stopped",
  state: "test",
  agent: "tester",
  harness: "claude-code",
  reason: "no-exit-after-result",
  afterMs: 10_000,
};

verifies("events.harness-stopped", () => {
  typeTest("names the step, the harness, why it was stopped and how long Halonic waited", () => {
    expectTypeOf<HarnessStopped>().toEqualTypeOf<{
      type: "harness.stopped";
      state: string;
      agent: string;
      harness: string;
      reason: "no-exit-after-result";
      afterMs: number;
    }>();
  });

  it("changes nothing the run's summary holds: no spend, no waiting approval, still running", () => {
    const summary = summaryOf(stopped);
    expect(summary.cost).toBe(0);
    expect(summary.usage).toStrictEqual({ inputTokens: 0, outputTokens: 0 });
    expect(summary.approvals).toEqual([]);
    expect(summary.status).toBe("running");
  });

  it("reads a log written before it as before", () => {
    const lines = readFileSync(
      fileURLToPath(new URL("./fixtures/old-run-log.jsonl", import.meta.url)),
      "utf8",
    )
      .split("\n")
      .filter((line) => line !== "");
    const events = lines.map(parseEventLine);
    expect(events).toStrictEqual(lines.map((line) => JSON.parse(line)));
    expect(events.some((event) => event.type === "harness.stopped")).toBe(false);
  });
});
