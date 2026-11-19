// @vitest-environment jsdom
import type { RunEventBody, ToolOutcome } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { StepEntry } from "./every-step-model.ts";
import { entered, logOf } from "./run-log.test-helper.ts";
import { StepPanel } from "./step-panel.tsx";

afterEach(unmountAll);

const draft: StepEntry = {
  id: "step-0",
  name: "Draft",
  mark: "failed",
  line: "Failed after 2 s",
  time: "10:40",
  label: "Draft, failed, 10:40, Failed after 2 s",
  groups: [],
};

const called = (tool: string): RunEventBody => ({
  type: "tool.called",
  agent: "writer",
  tool,
  args: { title: "Refund" },
});

const result = (tool: string, outcome: ToolOutcome): RunEventBody => ({
  type: "tool.result",
  agent: "writer",
  tool,
  result: "Error: connect ECONNREFUSED",
  outcome,
});

const connectorStarted: RunEventBody = {
  type: "connector.started",
  state: "draft",
  agent: "writer",
  connector: "notes-mcp",
  timeoutMs: 60_000,
};

/** The text under each tool call of Draft's panel, by the tool's name. */
function lines(events: readonly (readonly [number, RunEventBody])[]): Record<string, string> {
  const log = logOf("run_a_7k2m9p", [[0, entered("draft")], ...events]);
  const root = render(
    <StepPanel
      entry={draft}
      log={log}
      workflowName={(id) => id}
      openRun={undefined}
      onClose={() => {}}
    />,
  );
  const calls = [...root.querySelectorAll("aside li")];
  return Object.fromEntries(
    calls.map((call) => [
      call.querySelector("summary")?.textContent ?? "",
      call.querySelector("p")?.textContent ?? "",
    ]),
  );
}

verifies("runs.run-view.step-failed-call", () => {
  it("says under a call that broke off without an answer which tool and connector it was", () => {
    const shown = lines([
      [0, connectorStarted],
      [0, called("create_note")],
      [0, result("create_note", "unknown")],
    ]);

    expect(shown["create_note"]).toBe(
      "✕ Didn't work: the tool create_note (notes-mcp) broke off without an answer, so it may or may not have done its work.",
    );
  });

  it("says only that it didn't work when the log gives no reason, and never the tool's own text", () => {
    const shown = lines([
      [0, called("search_pages")],
      [0, result("search_pages", "error")],
    ]);

    expect(shown["search_pages"]).toBe("✕ Didn't work.");
    expect(Object.values(shown).join()).not.toContain("ECONNREFUSED");
  });

  it("adds nothing under a call that worked", () => {
    const shown = lines([
      [0, called("send_email")],
      [0, result("send_email", "ok")],
    ]);

    expect(shown).toEqual({ send_email: "" });
  });

  it("draws the ✕ for sighted people only", () => {
    lines([
      [0, called("search_pages")],
      [0, result("search_pages", "error")],
    ]);

    const mark = document.querySelector("aside li p span");
    expect(mark?.textContent?.trim()).toBe("✕");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
  });
});
