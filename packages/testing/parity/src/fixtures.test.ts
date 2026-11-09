import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadCases } from "./cases.ts";
import type { Recording, RunLogs } from "./recording.ts";

const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
const cases = loadCases(fixtures);

function recordingOf(folder: string): Recording {
  return JSON.parse(readFileSync(join(folder, "recorded.json"), "utf8")) as Recording;
}

const kinds = [
  "workspace",
  "deployments",
  "models",
  "provider",
  "runtime",
  "knowledge",
  "collection",
  "connector",
  "skill",
  "hub",
  "agent",
  "workflow",
  "workflowTest",
  "routine",
];

verifies("parity.fixtures-cover-every-kind", () => {
  it("has a passing file of every kind in the base recording", () => {
    const base = recordingOf(join(fixtures, "base"));
    expect(base.valid).toBe(true);
    expect(base.validate.exitCode).toBe(0);
    const passing = new Set(base.files.filter((f) => f.status === "pass").map((f) => f.schema));
    expect([...passing].sort()).toEqual([...kinds].sort());
    expect(base.files.every((f) => f.status === "pass")).toBe(true);
  });

  it("has a faulty case for every kind", () => {
    const faulty = new Set(cases.filter((c) => c.fault !== "valid").map((c) => c.kind));
    expect([...faulty].sort()).toEqual([...kinds].sort());
  });

  // Reads every recording at once: one by one, on a slow disk under load, they passed 5 s.
  it("has a recording from the reference for every case", { timeout: 20_000 }, async () => {
    const recorded = await Promise.all(
      cases.map(async (parityCase) => {
        const text = await readFile(join(parityCase.folder, "recorded.json"), "utf8");
        return { parityCase, recording: JSON.parse(text) as Recording };
      }),
    );
    for (const { parityCase, recording } of recorded) {
      expect(recording.case, parityCase.id).toBe(parityCase.id);
      expect(recording.reference).toBe("784f78d");
      expect(recording.line === null, parityCase.id).toBe(parityCase.expect === null);
    }
  });

  it("covers foreach, parallel, nested workflows, approvals, timers and a budget", () => {
    const base = join(fixtures, "base", "files");
    const read = (path: string): string => readFileSync(join(base, path), "utf8");
    const invoice = read("hubs/billing/workflows/invoice.workflow.yaml");
    expect(invoice).toMatch(/type: foreach/);
    expect(invoice).toMatch(/type: parallel/);
    expect(invoice).toMatch(/type: workflow\n {4}workflow: approval/);
    expect(read("hubs/billing/workflows/batch.workflow.yaml")).toMatch(/workflow: line-check/);
    const approval = read("hubs/billing/workflows/approval.workflow.yaml");
    expect(approval).toMatch(/type: wait/);
    expect(approval).toMatch(/event: approve/);
    expect(approval).toMatch(/after: 2d/);
    expect(read("workspace.yaml")).toMatch(
      /budget:\n {2}currency: EUR\n {2}perRun: 0.5\n {2}monthly: 20/,
    );
  });
});

verifies("parity.runner-records-test-run-logs", () => {
  const runLogs = JSON.parse(
    readFileSync(join(fixtures, "base", "run-logs.json"), "utf8"),
  ) as RunLogs;

  it("has the run logs of the base's 8 workflow tests, all passing in the old repo", () => {
    expect(runLogs.reference).toBe("784f78d");
    expect(runLogs.case).toBe("base");
    expect(runLogs.clock).toBe("2026-01-01T00:00:00.000Z");
    expect(runLogs.tests.map((t) => `${t.workflow}: ${t.name}`)).toEqual([
      "approval: approve",
      "approval: the timer fires after two days",
      "approval: one day is not enough",
      "batch: each line runs the line-check workflow",
      "invoice: an approved invoice is paid and announced",
      "invoice: a rejection with a comment ends in rejected",
      "invoice: an approval nobody answers expires after two days",
      "invoice: without a decision the run waits",
    ]);
    for (const test of runLogs.tests) {
      expect(test.passed, test.name).toBe(true);
      expect(test.failures, test.name).toEqual([]);
      expect(test.runId, test.name).toBe("test_1");
      expect(test.runs[0]?.events.length, test.name).toBeGreaterThan(0);
    }
  });

  it("moves the clock only on a test's advance steps", () => {
    const timer = runLogs.tests.find((t) => t.name === "the timer fires after two days");
    const events = (timer?.runs[0]?.events ?? []) as { type: string; at: string }[];
    expect(events.find((e) => e.type === "run.started")?.at).toBe("2026-01-01T00:00:00.000Z");
    expect(events.find((e) => e.type === "timer.fired")?.at).toBe("2026-01-03T00:00:00.000Z");
  });
});
