import { type RunEvent, type RunEventBody, summarize } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { mondayMorning } from "../summary.test-helper.ts";
import { everyStep } from "./every-step-model.ts";
import { entered, logOf } from "./run-log.test-helper.ts";
import { slowStepDueAt, slowStepLine } from "./slow-step.ts";

const at = new Date("2026-11-16T08:00:00Z");
const later = (seconds: number) => new Date(at.getTime() + seconds * 1000);

function event(rest: Record<string, unknown>, seq = 1): RunEvent {
  return { runId: "run_a", seq, at: at.toISOString(), ...rest } as RunEvent;
}

const call = event({
  type: "llm.request",
  agent: "reporter",
  provider: "claude",
  model: "m",
  messages: 1,
});

verifies("runs.run-view.slow-step-line", () => {
  describe("what the step waits for", () => {
    const waits: [string, RunEvent][] = [
      ["Waiting for Claude to answer.", call],
      [
        "Waiting for Ollama. The first answer can take a minute while it loads the model.",
        { ...call, provider: "ollama", model: "llama3.2" } as RunEvent,
      ],
      [
        "Waiting for the tool search_pages.",
        event({ type: "tool.called", agent: "reporter", tool: "search_pages", args: {} }),
      ],
      [
        "Starting the connector notes-mcp.",
        event({
          type: "connector.started",
          state: "draft",
          agent: "reporter",
          connector: "notes-mcp",
          timeoutMs: 60_000,
        }),
      ],
      [
        "Waiting for Claude Code.",
        event({
          type: "harness.started",
          state: "draft",
          agent: "reporter",
          harness: "claude-code",
          timeoutMs: 60_000,
        }),
      ],
      [
        "Starting the sandbox.",
        event({ type: "sandbox.started", state: "draft", agent: "reporter", timeoutMs: 30_000 }),
      ],
    ];
    it.each(waits)("says %s", (line, last) => {
      expect(slowStepLine([last], later(10))).toBe(line);
    });
  });

  it("stays quiet before 10 seconds, and when the last event names no wait", () => {
    expect(slowStepLine([call], later(9.9))).toBeUndefined();
    const answered = event({ type: "agent.completed", state: "draft", agent: "reporter" }, 2);
    expect(slowStepLine([call, answered], later(60))).toBeUndefined();
    expect(slowStepLine([], later(60))).toBeUndefined();
  });

  it("is due 10 seconds after the last event", () => {
    expect(slowStepDueAt([call])).toEqual(later(10));
    expect(slowStepDueAt([])).toBeUndefined();
  });

  describe("on the step the run is in", () => {
    const stepsAt = (seconds: number, ending: readonly RunEventBody[] = []) => {
      const events = logOf("run_a_01jd8q", [
        [0, entered("draft")],
        [
          1,
          { type: "llm.request", agent: "reporter", provider: "claude", model: "m", messages: 1 },
        ],
        ...ending.map((body) => [1, body] as const),
      ]);
      const summary = summarize(events);
      if (summary === null) throw new Error("The test log has no run.started.");
      return everyStep(
        events,
        summary,
        undefined,
        new Date(mondayMorning.getTime() + 60_000 + seconds * 1000),
      );
    };

    it("replaces Running once the step has been quiet for 10 seconds", () => {
      expect(stepsAt(3).map((entry) => entry.line)).toEqual(["Running"]);
      const [slow] = stepsAt(12);
      expect(slow?.line).toBe("Waiting for Claude to answer.");
      expect(slow?.label).toBe("Draft, running, 10:40, Waiting for Claude to answer.");
    });

    it("never shows on a run that has ended", () => {
      const [ended] = stepsAt(60, [{ type: "run.failed", state: "draft", error: "x" }]);
      expect(ended?.line).toBe("Failed after 1 min");
    });
  });
});
