import { KindedError } from "@halonicjs/std";
import type { WorkflowRef } from "@halonicjs/studio-feature-workflows/api";
import {
  errorsStoppingRun,
  type LoadedFileOf,
  type LoadedWorkspace,
  type WorkspaceIssue,
} from "@halonicjs/workspace";
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
 * What the checks found in the workflow's file, and the errors elsewhere that stop its run, as the
 * CLI's refusal decides it (`errorsStoppingRun`, HAL-15127): in the agents and workflows it uses,
 * and in any file every run depends on, such as `workspace.yaml` or a provider. Warnings outside its
 * own file stay on their files, as they don't stop a run.
 *
 * @param issues - every problem `halonic validate` lists, from {@link workspaceProblemsOf}
 */
export function problemsOf(
  workspace: LoadedWorkspace,
  issues: readonly WorkspaceIssue[],
  file: LoadedFileOf<"workflow">,
): WorkspaceIssue[] {
  const own = issues.filter((issue) => issue.file === file.path);
  if (file.hub === null) return own;
  const stopping = errorsStoppingRun(workspace, issues, {
    hubId: file.hub,
    workflowId: file.value.id,
  });
  return [...own, ...stopping.filter((issue) => issue.file !== file.path)];
}
