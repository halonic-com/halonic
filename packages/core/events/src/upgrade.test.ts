import { describe, expect, it } from "vitest";
import type { RunEvent } from "./run-event.ts";
import { summarize } from "./summarize.ts";
import { parseEventLine, upgradeEvent } from "./upgrade.ts";

const base = { runId: "r", seq: 1, at: "2026-01-01T00:00:00Z" };
const started = { ...base, type: "run.started", input: {}, kind: "run", definitionsVersion: "v" };

describe("events.upgrade-old-run-logs", () => {
  // Old test: legacy.test.ts "reads old run logs that say projectId".
  it("reads old run logs that say projectId", () => {
    const old = { ...started, projectId: "p", workflowId: "greet" };
    expect(upgradeEvent(old)).toMatchObject({ type: "run.started", hubId: "p" });
    expect(upgradeEvent(old)).not.toHaveProperty("projectId");
    expect(summarize([old as unknown as RunEvent])?.hubId).toBe("p");
  });

  // Old test: legacy.test.ts "reads old run logs that say flowId".
  it("reads old run logs that say flowId", () => {
    const old = { ...started, projectId: "p", flowId: "greet" };
    expect(upgradeEvent(old)).toMatchObject({ type: "run.started", workflowId: "greet" });
    expect(upgradeEvent(old)).not.toHaveProperty("flowId");
    expect(summarize([old as unknown as RunEvent])?.workflowId).toBe("greet");
  });

  it("keeps both names when the new one is already set", () => {
    const both = { ...started, hubId: "h", projectId: "p", workflowId: "w", flowId: "f" };
    expect(upgradeEvent(both)).toEqual(both);
  });

  it("leaves an old field that isn't text alone", () => {
    const odd = { ...started, hubId: "h", flowId: 7 };
    expect(upgradeEvent(odd)).toEqual(odd);
  });

  it("returns other events unchanged", () => {
    const entered = { ...base, type: "state.entered", state: "s", projectId: "p" };
    expect(upgradeEvent(entered)).toBe(entered);
  });
});

describe("events.parse-event-line", () => {
  it("parses an old run.started line into today's shape", () => {
    const line = JSON.stringify({ ...started, projectId: "p", workflowId: "greet" });
    expect(parseEventLine(line)).toEqual({ ...started, hubId: "p", workflowId: "greet" });
  });

  it("parses any other event as it is", () => {
    const entered = { ...base, seq: 2, type: "state.entered", state: "s" };
    expect(parseEventLine(JSON.stringify(entered))).toEqual(entered);
  });

  it("throws a SyntaxError on a line that isn't JSON", () => {
    expect(() => parseEventLine("not json")).toThrow(SyntaxError);
  });

  it("throws a SyntaxError on JSON that isn't an object", () => {
    for (const line of ["null", "42", '"run"', "[]"]) {
      expect(() => parseEventLine(line), line).toThrow(SyntaxError);
    }
  });
});
