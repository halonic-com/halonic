import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunEventBody } from "./run-event.ts";
import { summaryOf } from "./summarize.test-helper.ts";
import { parseEventLine } from "./upgrade.ts";

type HarnessAllowed = Extract<RunEventBody, { type: "harness.allowed" }>;

const line = {
  runId: "run-1",
  seq: 3,
  at: "2026-11-22T00:00:00.000Z",
  type: "harness.allowed",
  agent: "writer",
  tool: "Bash",
  detail: "npm test",
  rule: "asks-in-sandbox",
};

verifies("events.harness-allowed-waited", () => {
  typeTest("has an optional waitedMs", () => {
    expectTypeOf<HarnessAllowed["waitedMs"]>().toEqualTypeOf<number | undefined>();
  });

  it("reads waitedMs as written", () => {
    const event = parseEventLine(JSON.stringify({ ...line, waitedMs: 12 }));

    expect(event).toMatchObject({ type: "harness.allowed", waitedMs: 12 });
  });

  it("reads a line written before the field existed, without waitedMs", () => {
    const event = parseEventLine(JSON.stringify(line)) as HarnessAllowed;

    expect(event.tool).toBe("Bash");
    expect(event).not.toHaveProperty("waitedMs");
  });

  it("changes nothing the run's summary holds", () => {
    const summary = summaryOf({
      type: "harness.allowed",
      agent: "writer",
      tool: "Bash",
      detail: "npm test",
      rule: "asks-in-sandbox",
      waitedMs: 12,
    });

    expect(summary.cost).toBe(0);
    expect(summary.usage).toStrictEqual({ inputTokens: 0, outputTokens: 0 });
    expect(summary.approvals).toEqual([]);
  });
});
