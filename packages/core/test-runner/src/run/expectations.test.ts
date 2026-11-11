import {
  type CantTryStep,
  type RunEvent,
  type RunEventBody,
  type RunSummary,
  summarize,
} from "@halonicjs/events";
import type { WorkflowTestCase } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { TestRun } from "../test-result.ts";
import { checkExpectations } from "./expectations.ts";

type Expect = WorkflowTestCase["expect"];

/** A run made of these events after its start, as the engine would log them. */
function run(bodies: RunEventBody[], id = "test_1"): TestRun {
  const started: RunEventBody = {
    type: "run.started",
    hubId: "billing",
    workflowId: "invoice",
    input: {},
    kind: "test",
    definitionsVersion: "v1",
  };
  const events = [started, ...bodies].map(
    (body, index) =>
      ({ ...body, runId: id, seq: index + 1, at: "2026-11-10T09:00:00.000Z" }) as RunEvent,
  );
  return { id, summary: summarize(events) as RunSummary, events };
}

/** A run that went through the steps and finished in the last one. */
function completed(steps: string[], context: Record<string, unknown> = {}): TestRun {
  const last = steps.at(-1) ?? "";
  return run([
    ...steps.map((state): RunEventBody => ({ type: "state.entered", state })),
    ...Object.entries(context).map(
      ([key, value]): RunEventBody => ({ type: "context.updated", key, value }),
    ),
    { type: "run.completed", state: last, context },
  ]);
}

const waiting = run([
  { type: "state.entered", state: "extract" },
  { type: "state.entered", state: "approval" },
  { type: "run.waiting", state: "approval", events: ["approve"] },
]);

const failed = run([
  { type: "state.entered", state: "extract" },
  { type: "run.failed", state: "extract", error: "The model refused.", reason: "error" },
]);

const notifyStep: CantTryStep = {
  status: "cant-try",
  item: "hubs/billing/workflows/invoice.yaml",
  step: "notify",
  reason: { kind: "needs-left-out-change", path: "connections.yaml", leftOut: "connections" },
};

const cantTry = run([
  { type: "state.entered", state: "extract" },
  { type: "context.updated", key: "total", value: 120 },
  { type: "state.entered", state: "notify" },
  { type: "run.cant-try", state: "notify", cantTry: [notifyStep] },
]);

function check(expect: Expect, ...runs: TestRun[]) {
  return checkExpectations(expect, runs);
}

verifies("test-runner.expectations", () => {
  describe("checkExpectations", () => {
    it("passes a run that ends as expected", () => {
      const ended = completed(["extract", "done"], { note: "Paid." });

      expect(
        check(
          { final: "done", states: ["extract", "done"], status: "completed", context: {} },
          ended,
        ),
      ).toEqual([]);
    });

    it("gives the step the run ended in when it isn't the expected one", () => {
      expect(check({ final: "done" }, completed(["extract", "rejected"]))).toEqual([
        { kind: "final", expected: "done", actual: "rejected" },
      ]);
    });

    it("gives the steps alone when they are wrong, not the final step too", () => {
      expect(
        check({ final: "done", states: ["extract", "done"] }, completed(["extract", "rejected"])),
      ).toEqual([
        { kind: "states", expected: ["extract", "done"], actual: ["extract", "rejected"] },
      ]);
    });

    it("takes final without status to mean the run finished", () => {
      expect(check({ final: "done" }, waiting)).toEqual([
        { kind: "status", expected: "completed", actual: "waiting", step: "approval" },
      ]);
    });

    it("gives the step a run failed in, and none for a run that finished", () => {
      expect(check({ status: "waiting" }, failed)).toEqual([
        { kind: "status", expected: "waiting", actual: "failed", step: "extract" },
      ]);
      expect(check({ status: "failed" }, completed(["done"]))).toEqual([
        { kind: "status", expected: "failed", actual: "completed" },
      ]);
    });

    it("fails a failed run with its error unless the test expects it to fail", () => {
      expect(check({}, failed)).toEqual([{ kind: "error", message: "The model refused." }]);
      expect(check({ status: "failed" }, failed)).toEqual([]);
    });

    it("fails a run that couldn't try every step, with those steps, when no status is expected", () => {
      expect(check({ context: { total: 120 } }, cantTry)).toEqual([
        { kind: "cant-try", steps: [notifyStep] },
      ]);
    });

    it("never takes a run that couldn't try every step for the status a case expects", () => {
      expect(check({ final: "notify" }, cantTry)).toEqual([
        { kind: "status", expected: "completed", actual: "cant-try", step: "notify" },
      ]);
      expect(check({ status: "failed" }, cantTry)).toEqual([
        { kind: "status", expected: "failed", actual: "cant-try", step: "notify" },
      ]);
    });

    it("matches context partly, one failure per field by its path", () => {
      const ended = completed(["done"], {
        ticket: { status: "open", tags: ["late", "paper"], owner: "ops" },
        total: 120,
      });

      expect(check({ context: { ticket: { owner: "ops" }, total: 120 } }, ended)).toEqual([]);
      expect(
        check(
          {
            context: {
              ticket: { status: "closed", tags: ["late"], priority: "high" },
              total: 120,
            },
          },
          ended,
        ),
      ).toEqual([
        { kind: "context", path: "ticket.status", expected: "closed", set: true, actual: "open" },
        {
          kind: "context",
          path: "ticket.tags",
          expected: ["late"],
          set: true,
          actual: ["late", "paper"],
        },
        { kind: "context", path: "ticket.priority", expected: "high", set: false },
      ]);
    });

    it("compares a whole value when the run set something else than an object", () => {
      expect(
        check({ context: { total: { net: 100 } } }, completed(["done"], { total: 120 })),
      ).toEqual([
        { kind: "context", path: "total", expected: { net: 100 }, set: true, actual: 120 },
      ]);
    });

    it("asks for at least the listed files, naming the ones the run saved", () => {
      const saved = run([
        {
          type: "artifact.created",
          state: "notify",
          name: "note.md",
          hash: "h",
          mediaType: "text/markdown",
          size: 3,
        },
        { type: "run.completed", state: "done", context: {} },
      ]);

      expect(check({ artifacts: ["note.md"] }, saved)).toEqual([]);
      expect(check({ artifacts: ["note.md", "receipt.pdf"] }, saved)).toEqual([
        { kind: "artifacts", expected: "receipt.pdf", saved: ["note.md"] },
      ]);
      expect(check({ artifacts: ["note.md"] }, completed(["done"]))).toEqual([
        { kind: "artifacts", expected: "note.md", saved: [] },
      ]);
    });

    it("gives only the first step that started an unscripted program, in a child run too", () => {
      const child = run(
        [
          { type: "state.entered", state: "code" },
          {
            type: "run.failed",
            state: "code",
            error: "Codex didn't start.",
            reason: "harness-start-failed",
          },
        ],
        "test_1.4",
      );
      const unscripted = [
        { runId: "test_1.4", agent: "coder" },
        { runId: "test_1", agent: "writer" },
      ];

      expect(
        checkExpectations({ final: "done", context: { fixed: true } }, [failed, child], unscripted),
      ).toEqual([{ kind: "unscripted-program", step: "code", agent: "coder" }]);
    });

    it("finds nothing to check when there is no run", () => {
      expect(check({ final: "done" })).toEqual([]);
    });
  });
});
