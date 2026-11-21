import { KindedError } from "@halonicjs/std";
import type { WorkflowRef } from "@halonicjs/studio-feature-workflows/api";
import type { LoadedFileOf, LoadedWorkspace, WorkspaceIssue } from "@halonicjs/workspace";
import { editYaml, readYaml, writeYamlFile } from "@halonicjs/yaml";

/** Where the workflow files of a hub are kept. */
export const workflowFolder = (hubId: string): string => `hubs/${hubId}/workflows`;

/** The ending of a workflow's file name. */
export const workflowSuffix = ".workflow.yaml";

/** Where the test cases of a workflow are kept: next to it, in the hub's `workflows` folder. */
export const testFile = ({ hubId, id }: WorkflowRef): string =>
  `${workflowFolder(hubId)}/${id}.test.yaml`;

/**
 * The text of a new workflow: a step `start` that leads to the final step `done`. `start` runs
 * `agentId` when there is one; without it, `start` names no agent, which `validate` reports as an
 * error because a run fails there (HAL-14303).
 */
export function newWorkflowText(id: string, name: string, agentId?: string): string {
  return [
    `id: ${id}`,
    // A JSON string is a YAML double-quoted one, so any name a person types is safe.
    `name: ${JSON.stringify(name)}`,
    "initial: start",
    "states:",
    "  start:",
    ...(agentId === undefined ? [] : [`    agent: ${agentId}`]),
    "    on:",
    "      - to: done",
    "  done:",
    "    type: final",
    "",
  ].join("\n");
}

/** One test case, as a workflow's test file writes it. */
export interface TestCase {
  readonly name: string;
  readonly input: unknown;
  readonly expect: { readonly final: string };
}

/**
 * The text of the workflow `workflowId`'s test file at `path` (now `text`, `null` when there is
 * none) with `testCase` added after the others; other cases and comments stay as they are.
 *
 * @throws when the file can't be read or changed, or already has a case of that name
 */
export function withTestCase(
  path: string,
  text: string | null,
  workflowId: string,
  testCase: TestCase,
): string {
  if (text === null) return writeYamlFile({ version: 1, workflow: workflowId, cases: [testCase] });
  const read = readYaml(text);
  if (!read.ok) throw new Error(`The test file ${path} can't be read: ${read.error.message}`);
  const cases = (read.value.data as { cases?: unknown } | null)?.cases;
  if (!Array.isArray(cases)) throw new Error(`The test file ${path} has no list of cases.`);
  if (cases.some((one) => (one as { name?: unknown } | null)?.name === testCase.name)) {
    throw new Error(`The workflow already has a test case called "${testCase.name}".`);
  }
  const edited = editYaml(text, [
    { kind: "insert", path: ["cases", cases.length], value: testCase },
  ]);
  if (!edited.ok)
    throw new Error(`The test file ${path} can't be changed: ${edited.error.message}`);
  return edited.value.text;
}

/** Throws `invalid_input` when the run ended in no step, so it can't say what a test should expect. */
export function endedIn(runId: string, state: string | null): string {
  if (state === null) {
    throw new KindedError(
      "invalid_input",
      `The run ${runId} ended in no step, so it can't say what to expect.`,
    );
  }
  return state;
}

/**
 * What the checks found in the workflow's file, and the errors in the files of the agents its steps
 * name: such an agent can't run, so neither can the workflow. A workflow names only its own hub's
 * agents. The agents' warnings stay on their own files, as they don't stop a run.
 */
export function problemsOf(
  workspace: LoadedWorkspace,
  file: LoadedFileOf<"workflow">,
): WorkspaceIssue[] {
  const agentFiles = new Set(
    agentsNamed(file.value).map((agent) => `hubs/${file.hub}/agents/${agent}.agent.yaml`),
  );
  return workspace.issues.filter(
    (issue) =>
      issue.file === file.path || (issue.severity === "error" && agentFiles.has(issue.file)),
  );
}

/** The agents a workflow's steps run: a task's or a for-each's `agent`, and each parallel branch's. */
function agentsNamed(workflow: LoadedFileOf<"workflow">["value"]): string[] {
  return Object.values(workflow.states).flatMap((state) => [
    ...(state.agent === undefined ? [] : [state.agent]),
    ...Object.values(state.branches ?? {}).map((branch) => branch.agent),
  ]);
}
