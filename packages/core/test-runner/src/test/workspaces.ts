// Small invented workspaces for this package's tests: one hub, `billing`,
// with the workflows and test files a test gives.

import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import type { TestInput } from "../test-deps.ts";
import { MemorySource } from "./memory-source.ts";

const hub = "hubs/billing";

/** A wait for `approve` that expires after two days. */
export const approvalWorkflow = `id: approval
name: Approval
initial: decide
states:
  decide:
    type: wait
    on:
      - { to: approved, event: approve }
      - { to: expired, after: 2d }
  approved: { type: final }
  expired: { type: final }
`;

/** The writer drafts a note, then a person approves it. */
export const draftWorkflow = `id: draft
name: Draft
initial: write
states:
  write: { type: task, agent: writer, input: "Write about {{input.topic}}", output: note, on: [{ to: review }] }
  review: { type: workflow, workflow: approval, on: [{ to: done }] }
  done: { type: final }
`;

/** An agent with no model of its own: tests give every agent the scripted model. */
export function agent(id: string, extra = ""): Record<string, string> {
  return { [`${hub}/agents/${id}.agent.yaml`]: `id: ${id}\nname: ${id}\n${extra}` };
}

/** A workflow file of the hub, by id. */
export function workflow(id: string, text: string): Record<string, string> {
  return { [`${hub}/workflows/${id}.workflow.yaml`]: text };
}

/** A workflow test file of the hub, by the workflow's id. */
export function testFile(id: string, text: string): Record<string, string> {
  return { [`${hub}/workflows/${id}.test.yaml`]: text };
}

/**
 * The input for a run of the tests of a workspace made of these files and
 * the hub. It throws when the workspace has an error: a test's own fixture
 * must load.
 */
export async function testInput(
  ...parts: Record<string, string>[]
): Promise<TestInput & { workspace: LoadedWorkspace }> {
  const source = new MemorySource(
    Object.assign(
      {
        "workspace.yaml": "id: acme\nname: Acme\n",
        [`${hub}/hub.yaml`]: "id: billing\nname: Billing\n",
      },
      ...parts,
    ),
  );
  const workspace = await loadWorkspace(source);
  const errors = workspace.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) throw new Error(`The fixture doesn't load: ${JSON.stringify(errors)}`);
  return { workspace, textOf: (path) => source.read(path) };
}
