import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCases } from "./cases.ts";
import type { Recording } from "./recording.ts";

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

describe("parity.fixtures-cover-every-kind", () => {
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

  it("has a recording from the reference for every case", () => {
    for (const parityCase of cases) {
      const recording = recordingOf(parityCase.folder);
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
