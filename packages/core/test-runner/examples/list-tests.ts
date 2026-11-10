import type { DefinitionSource } from "@halonicjs/ports";
import { loadWorkspace } from "@halonicjs/workspace";
import { listWorkspaceTests } from "../src/index.ts";

// A workspace with one hub, one workflow and its test file. Normally the
// files come from a folder on disk, through the CLI's file adapter.
const files: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/billing/hub.yaml": "id: billing\nname: Billing\n",
  "hubs/billing/workflows/approval.workflow.yaml": [
    "id: approval",
    "initial: decide",
    "states:",
    "  decide: { type: wait, on: [{ to: approved, event: approve }] }",
    "  approved: { type: final }",
    "",
  ].join("\n"),
  "hubs/billing/workflows/approval.test.yaml": [
    "workflow: approval",
    "cases:",
    "  - name: approve",
    "    events: [approve]",
    "    expect: { final: approved }",
    "  - name: without a decision the run waits",
    "    expect: { status: waiting }",
    "",
  ].join("\n"),
};

const source: DefinitionSource = {
  location: "memory:example",
  list: async () => Object.keys(files).sort(),
  read: async (path) => files[path] ?? null,
  version: async () => "v1",
};

/** Loads the workspace and lists its tests named "without a decision the run waits". */
export async function runExample(): Promise<string[]> {
  const workspace = await loadWorkspace(source);
  const tests = await listWorkspaceTests({
    workspace,
    textOf: (path) => source.read(path),
    filter: { name: "without a decision the run waits" },
  });
  return tests.map((test) => `${test.workflow} › ${test.name} (${test.file}:${test.line})`);
  // ["approval › without a decision the run waits (hubs/billing/workflows/approval.test.yaml:6)"]
}
