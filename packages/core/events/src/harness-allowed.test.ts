import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunEventBody } from "./run-event.ts";
import { summaryOf } from "./summarize.test-helper.ts";
import { parseEventLine } from "./upgrade.ts";

type HarnessAllowed = Extract<RunEventBody, { type: "harness.allowed" }>;

const allowed: HarnessAllowed = {
  type: "harness.allowed",
  agent: "writer",
  tool: "Edit",
  detail: "/data/proposals/run_1/src/a.ts",
  rule: "asks-in-sandbox",
};

verifies("events.harness-allowed", () => {
  typeTest("names the agent, the tool, what it touched and the rule", () => {
    expectTypeOf<HarnessAllowed>().toEqualTypeOf<{
      type: "harness.allowed";
      agent: string;
      tool: string;
      detail: string;
      rule: "asks-in-sandbox";
    }>();
  });

  it("changes nothing the run's summary holds: no spend, no waiting approval", () => {
    const summary = summaryOf(allowed);
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
    expect(events.some((event) => event.type === "harness.allowed")).toBe(false);
  });
});
