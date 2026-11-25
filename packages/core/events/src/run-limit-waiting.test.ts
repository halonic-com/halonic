import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunFailureCause } from "./run-basics.ts";
import type { RunEventBody } from "./run-event.ts";
import { summaryOf } from "./summarize.test-helper.ts";
import { parseEventLine } from "./upgrade.ts";

type LimitWaiting = Extract<RunEventBody, { type: "run.limit-waiting" }>;

const cause: RunFailureCause = {
  kind: "limit_reached",
  code: "plan.cost",
  detail: { unit: "cost", used: "10", limit: "10" },
};

const waiting: LimitWaiting = {
  type: "run.limit-waiting",
  state: "draft",
  error: "Plan limit reached: 10 of 10 cost used.",
  cause,
  until: "2026-12-02T07:00:00.000Z",
  input: { type: "effect-done", callId: "call-1" },
};

verifies("events.run-limit-waiting", () => {
  typeTest("names the step, the stop, when the wait ends and the refused input", () => {
    expectTypeOf<LimitWaiting>().toEqualTypeOf<{
      type: "run.limit-waiting";
      state: string | null;
      error: string;
      cause: RunFailureCause;
      until: string;
      input: Record<string, unknown>;
    }>();
  });

  it("waits for continue only, until the wait ends, with no spend", () => {
    const summary = summaryOf(waiting);
    expect(summary.status).toBe("waiting");
    expect(summary.accepts).toEqual(["continue"]);
    expect(summary.nextTimer).toBe("2026-12-02T07:00:00.000Z");
    expect(summary.limit).toEqual(cause);
    expect(summary.lastWaitingAt).toBe("T2");
    expect(summary.cost).toBe(0);
    expect(summary.usage).toStrictEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("runs again with no limit once continue is received", () => {
    const summary = summaryOf(waiting, { type: "event.received", event: "continue" });
    expect(summary.status).toBe("running");
    expect(summary.accepts).toEqual([]);
    expect(summary.nextTimer).toBeNull();
    expect(summary.limit).toBeUndefined();
  });

  it("fails with the failure's cause and no limit when the wait ends", () => {
    const summary = summaryOf(waiting, {
      type: "run.failed",
      state: "draft",
      error: waiting.error,
      reason: "budget",
      cause,
    });
    expect(summary.status).toBe("failed");
    expect(summary.cause).toEqual(cause);
    expect(summary.limit).toBeUndefined();
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
    expect(events.some((event) => event.type === "run.limit-waiting")).toBe(false);
  });
});
