// @vitest-environment jsdom
import { type RunEventBody, summarize } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { mondayMorning } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { everyStep, type StepEntry } from "./every-step-model.ts";
import { entered, logOf } from "./run-log.test-helper.ts";
import { runLogLines } from "./run-log-model.ts";
import { StepPanel } from "./step-panel.tsx";

afterEach(unmountAll);

const draft: StepEntry = {
  id: "step-0",
  name: "Draft",
  mark: "done",
  line: "Done in 2 s",
  time: "10:40",
  label: "Draft, done, 10:40, Done in 2 s",
  groups: [],
};

const stopped = (overrides: Partial<Record<"harness" | "reason" | "afterMs", unknown>> = {}) =>
  ({
    type: "harness.stopped",
    state: "draft",
    agent: "writer",
    harness: "claude-code",
    reason: "no-exit-after-result",
    afterMs: 10_000,
    ...overrides,
  }) as RunEventBody;

const modelCall: readonly (readonly [number, RunEventBody])[] = [
  [0, { type: "llm.request", agent: "writer", model: "claude-sonnet", messages: [] } as never],
  [
    0,
    {
      type: "llm.response",
      agent: "writer",
      model: "claude-sonnet",
      usage: { inputTokens: 1204, outputTokens: 312 },
    } as never,
  ],
];

const toolCall: readonly [number, RunEventBody] = [
  0,
  { type: "tool.called", agent: "writer", tool: "write_file", args: {} } as never,
];

const said =
  "Claude Code gave its result but didn't stop on its own, so Halonic stopped it after 10 seconds. The step kept its result.";

/** The log of a run whose step Draft wrote `events`, then moved on to Send. */
function logWith(events: readonly (readonly [number, RunEventBody])[]) {
  return logOf("run_a_7k2m9p", [[0, entered("draft")], ...events, [1, entered("send")]]);
}

/** Draft's panel for `events`, and its quiet harness lines. */
function panel(events: readonly (readonly [number, RunEventBody])[]) {
  const root = render(
    <StepPanel
      entry={draft}
      log={logWith(events)}
      workflowName={(id) => id}
      openRun={undefined}
      onClose={() => {}}
    />,
  );
  const lines = [...root.querySelectorAll("aside p")].filter((line) =>
    line.textContent?.includes("gave its result"),
  );
  return { root, lines, texts: lines.map((line) => line.textContent) };
}

verifies("runs.run-view.step-harness-stopped", () => {
  it("says after the step's calls that Halonic stopped Claude Code and the step kept its result", () => {
    const { lines, texts } = panel([...modelCall, toolCall, [0, stopped()]]);

    expect(texts).toEqual([said]);
    const before = lines[0]?.previousElementSibling;
    expect(before?.tagName).toBe("SECTION");
    expect(before?.querySelector("h3")?.textContent).toBe("Tool calls");
  });

  it("is a muted line without a ✕, an icon or an announcement", () => {
    const { root, lines } = panel([...modelCall, [0, stopped()]]);

    const line = lines[0];
    expect(line?.className).toContain("text-fg-muted");
    expect(line?.textContent).not.toContain("✕");
    expect(line?.querySelector("svg, [aria-hidden]")).toBeNull();
    expect(root.querySelector("[aria-live], [role=status], [role=alert]")).toBeNull();
  });

  it("leaves Draft done in Every step, the run going on to its next step", () => {
    const events = logWith([...modelCall, [0, stopped()]]);
    const summary = summarize(events);
    if (summary === null) throw new Error("The test log has no run.started.");

    const steps = everyStep(
      events,
      summary,
      { name: "Support reply", stepDescription: () => undefined },
      mondayMorning,
    );

    expect(steps.map(({ name, mark }) => [name, mark])).toEqual([
      ["Draft", "done"],
      ["Send", "running"],
    ]);
  });

  it("says 1 second for an afterMs of 1000, and at least 1 second for less", () => {
    expect(panel([[0, stopped({ afterMs: 1000 })]]).texts[0]).toContain("after 1 second.");
    expect(panel([[0, stopped({ afterMs: 200 })]]).texts[0]).toContain("after 1 second.");
    expect(panel([[0, stopped({ afterMs: 61_400 })]]).texts[0]).toContain("after 61 seconds.");
  });

  it("names Codex, and an unknown harness by its id with a capital, escaped", () => {
    expect(panel([[0, stopped({ harness: "codex" })]]).texts[0]).toMatch(/^Codex gave its result/);
    expect(panel([[0, stopped({ harness: "acme-harness" })]]).texts[0]).toMatch(
      /^Acme-harness gave its result/,
    );
    expect(panel([[0, stopped({ harness: "acme\u202Eharness" })]]).texts[0]).toMatch(
      /^Acme\\u202eharness gave its result/,
    );
  });

  it("shows no line for a reason Studio doesn't know, while the run log still shows the event", () => {
    const events: readonly (readonly [number, RunEventBody])[] = [
      ...modelCall,
      [0, stopped({ reason: "acme-reason" })],
    ];

    expect(panel(events).texts).toEqual([]);
    const logTypes = runLogLines(logWith(events)).map((line) =>
      line.kind === "event" ? line.type : line.kind,
    );
    expect(logTypes).toContain("harness.stopped");
  });

  it("keeps the no-calls line for a step without calls, with the line under it", () => {
    const { root, lines } = panel([[0, stopped()]]);

    expect(lines[0]?.previousElementSibling?.textContent).toBe(
      "This step made no model or tool calls.",
    );
    expect(root.textContent).toContain(said);
  });

  it("gives each harness.stopped of the step its own line, in order", () => {
    const { texts } = panel([
      [0, stopped({ afterMs: 10_000 })],
      [0, stopped({ harness: "codex", afterMs: 5000 })],
    ]);

    expect(texts).toEqual([
      said,
      "Codex gave its result but didn't stop on its own, so Halonic stopped it after 5 seconds. The step kept its result.",
    ]);
  });
});
