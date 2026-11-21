// @vitest-environment jsdom
import type { RunEventBody, ToolFailureCause, ToolOutcome } from "@halonicjs/events";
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

const result = (tool: string, outcome: ToolOutcome, cause?: ToolFailureCause): RunEventBody => ({
  type: "tool.result",
  agent: "writer",
  tool,
  result: "Error: connect ECONNREFUSED",
  outcome,
  ...(cause === undefined ? {} : { cause }),
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

verifies("runs.run-view.step-failed-call", () => {
  /** The line under `create_note`, called on notes-mcp, whose result has `cause`. */
  const lineFor = (cause: ToolFailureCause, outcome: ToolOutcome = "error"): string | undefined =>
    lines([
      [0, connectorStarted],
      [0, called("create_note")],
      [0, result("create_note", outcome, cause)],
    ])["create_note"];

  it("says how long a tool had when it ran out of time", () => {
    expect(lineFor({ code: "time-limit", seconds: 60 }, "unknown")).toBe(
      "✕ Didn't work: the tool create_note (notes-mcp) didn't answer within 60 seconds, so it may or may not have done its work.",
    );
    expect(lineFor({ code: "time-limit", seconds: 1 }, "unknown")).toContain("within 1 second,");
  });

  it("says Halonic stopped while the tool was running", () => {
    expect(lineFor({ code: "engine-stopped" }, "unknown")).toBe(
      "✕ Didn't work: Halonic stopped while the tool create_note (notes-mcp) was running, so it may or may not have done its work.",
    );
  });

  it.each([
    ["not-connected", "its connector isn't connected."],
    ["tool-gone", "its connector no longer offers it."],
    ["sending-off", "sending is turned off."],
    ["bad-arguments", "the model gave it arguments that aren't usable."],
  ] as const)("says why a call wasn't made: %s", (why, because) => {
    expect(lineFor({ code: "not-made", why })).toBe(
      `✕ Didn't work: the call to create_note (notes-mcp) wasn't made, because ${because}`,
    );
  });

  it("names the program or the secret a connector that didn't start missed", () => {
    expect(
      lineFor({ code: "connector-not-started", why: "program-missing", name: "acme-notes-mcp" }),
    ).toBe(
      "✕ Didn't work: the connector notes-mcp didn't start: its program acme-notes-mcp isn't on this computer.",
    );
    expect(
      lineFor({ code: "connector-not-started", why: "secret-not-set", name: "mailbox-token" }),
    ).toBe(
      "✕ Didn't work: the connector notes-mcp didn't start: it needs the secret mailbox-token, which isn't set.",
    );
  });

  it("says only that the connector didn't start when the cause names nothing", () => {
    const plain = "✕ Didn't work: the connector notes-mcp didn't start.";
    expect(lineFor({ code: "connector-not-started", why: "other" })).toBe(plain);
    expect(lineFor({ code: "connector-not-started", why: "program-missing" })).toBe(plain);
  });

  it("names the connector by its tool when the log doesn't name it", () => {
    const shown = lines([
      [0, called("read_note")],
      [0, result("read_note", "error", { code: "connector-not-started", why: "other" })],
    ]);

    expect(shown["read_note"]).toBe(
      "✕ Didn't work: the connector of the tool read_note didn't start.",
    );
  });

  it("shows the program and the secret in code style, with hidden characters escaped", () => {
    lines([
      [0, connectorStarted],
      [0, called("create_note")],
      [
        0,
        result("create_note", "error", {
          code: "connector-not-started",
          why: "secret-not-set",
          name: `mailbox${String.fromCodePoint(0x202e)}token`,
        }),
      ],
    ]);

    const names = [...document.querySelectorAll("aside li p code")].map((code) => code.textContent);
    expect(names).toEqual(["mailbox\\u202etoken"]);
  });

  it("reads a cause it doesn't know as no cause", () => {
    const unknownCause = { code: "melted" } as unknown as ToolFailureCause;

    expect(lineFor(unknownCause)).toBe("✕ Didn't work.");
    expect(lineFor(unknownCause, "unknown")).toContain("broke off without an answer");
  });
});
