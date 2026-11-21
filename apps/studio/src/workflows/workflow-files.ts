import type { DefinitionSource } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { WorkflowRef } from "@halonicjs/studio-feature-workflows/api";
import { editYaml, readYaml, writeYamlFile } from "@halonicjs/yaml";

/** Where the workflow files of a hub are kept. */
export const workflowFolder = (hubId: string): string => `hubs/${hubId}/workflows`;

/** The ending of a workflow's file name. */
export const workflowSuffix = ".workflow.yaml";

/** Where the test cases of a workflow are kept: next to it, in the hub's `workflows` folder. */
export const testFile = ({ hubId, id }: WorkflowRef): string =>
  `${workflowFolder(hubId)}/${id}.test.yaml`;

/** The text of a new workflow: a step `start` that leads to the final step `done`. */
export function newWorkflowText(id: string, name: string): string {
  return [
    `id: ${id}`,
    // A JSON string is a YAML double-quoted one, so any name a person types is safe.
    `name: ${JSON.stringify(name)}`,
    "initial: start",
    "states:",
    "  start:",
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
 * The workspace's hubs and its library as files, with unsaved changes applied. Only `hubs/` and
 * `library/` are listed: a workflow is checked against the agents and workflows of its own hub,
 * and its agents' connectors may sit in the workspace's library (HAL-13344).
 */
export function unsavedSource(files: {
  read(path: string): Promise<string | null>;
  list(dir: string): Promise<string[]>;
}): DefinitionSource {
  return {
    location: "workspace:unsaved",
    list: async () => {
      const [hubs, library] = await Promise.all([files.list("hubs"), files.list("library")]);
      return [...hubs, ...library];
    },
    read: (path) => files.read(path),
    version: async () => "unsaved",
  };
}
