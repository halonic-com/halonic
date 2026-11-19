import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunEventBody } from "./run-event.ts";
import { summaryOf } from "./summarize.test-helper.ts";
import { parseEventLine } from "./upgrade.ts";

type BridgeFailed = Extract<RunEventBody, { type: "bridge.failed" }>;

const failed: BridgeFailed = {
  type: "bridge.failed",
  agent: "writer",
  kind: "internal",
  message: "the tool list could not be read",
};

verifies("events.bridge-failed", () => {
  typeTest("names the agent, the error kind and the message", () => {
    expectTypeOf<BridgeFailed>().toEqualTypeOf<{
      type: "bridge.failed";
      agent: string;
      kind: string;
      message: string;
    }>();
  });

  typeTest("has no cost or usage a budget could count", () => {
    expectTypeOf<BridgeFailed>().not.toHaveProperty("cost");
    expectTypeOf<BridgeFailed>().not.toHaveProperty("usage");
  });

  it("adds nothing to the run's spend", () => {
    const summary = summaryOf(failed);
    expect(summary.cost).toBe(0);
    expect(summary.usage).toStrictEqual({ inputTokens: 0, outputTokens: 0 });
    expect(summary.status).toBe("running");
  });

  it("reads a log written before it as before, with no bridge failure", () => {
    const lines = readFileSync(
      fileURLToPath(new URL("./fixtures/old-run-log.jsonl", import.meta.url)),
      "utf8",
    )
      .split("\n")
      .filter((line) => line !== "");
    const events = lines.map(parseEventLine);
    expect(events).toStrictEqual(lines.map((line) => JSON.parse(line)));
    expect(events.some((event) => event.type === "bridge.failed")).toBe(false);
  });
});
