import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fileChecks, placeIdOf } from "./file-checks.ts";

const fixtures = fileURLToPath(new URL("../../fixtures/", import.meta.url));

// Read once, while the file loads: on a slow disk under load, reading every
// fixture can take longer than a test's time limit.
const checks = fileChecks(fixtures);

verifies("parity.compare-runs-on-fixtures", () => {
  it("lists a read file of each of the 14 kinds", () => {
    const kinds = new Set(checks.map((check) => check.kind));
    expect(kinds.size).toBe(14);
    expect(checks.every((check) => check.recorded.read)).toBe(true);
    expect(checks.every((check) => check.text.length > 0)).toBe(true);
  });

  it("leaves out the files the old loader skipped", () => {
    const names = new Set(checks.map((check) => check.name));
    expect(names.size).toBe(checks.length);
    expect([...names].some((name) => name.startsWith("base: "))).toBe(true);
  });

  it.each([
    ["agent", "hubs/billing/agents/clerk.agent.yaml", "clerk"],
    ["workflow", "hubs/billing/workflows/extra.workflow.yaml", "extra"],
    ["routine", "workflows/routines/hourly-check.routine.yaml", "hourly-check"],
    ["connector", "library/connectors/tracker.connector.yaml", "tracker"],
    ["provider", "providers/local-llm.yaml", "local-llm"],
    ["hub", "hubs/billing/hub.yaml", "billing"],
    ["skill", "library/skills/plain-words/SKILL.md", "plain-words"],
    ["workspace", "workspace.yaml", undefined],
    ["workflowTest", "hubs/billing/workflows/approval.test.yaml", undefined],
  ])("gives a %s at %s the id from its place", (kind, file, id) => {
    expect(placeIdOf(kind, file)).toBe(id);
  });
});
