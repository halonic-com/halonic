// The test cases of a workspace, found and filtered without running them.

import type { WorkflowTestCase } from "@halonicjs/format";
import { filesOf } from "@halonicjs/workspace";
import { readYaml } from "@halonicjs/yaml";
import type { TestCaseRef, TestFilter, TestInput } from "./test-deps.ts";

/** One case to run, with where it is. */
export interface FoundTestCase extends TestCaseRef {
  readonly testCase: WorkflowTestCase;
}

/**
 * The workspace's test cases that pass the filter, in file order and then
 * case order. A test file at the workspace root has no hub, so its cases are
 * left out: the loader already reports it.
 */
export async function findTestCases(input: TestInput): Promise<FoundTestCase[]> {
  const found: FoundTestCase[] = [];
  for (const file of filesOf(input.workspace, "workflowTest")) {
    const hub = file.hub;
    if (hub === null) continue;
    const workflow = file.value.workflow;
    const lineOf = await linesOf(input, file.path);
    file.value.cases.forEach((testCase, index) => {
      const ref = { hub, workflow, name: testCase.name, file: file.path };
      if (!matches(ref, input.filter)) return;
      const line = lineOf(index);
      found.push(line === undefined ? { ...ref, testCase } : { ...ref, line, testCase });
    });
  }
  return found;
}

/**
 * Lists the workspace's test cases that pass the filter, without running
 * them, for `halonic test --list`.
 *
 * @example
 * await listWorkspaceTests({ workspace, filter: { name: "answers a refund question" } });
 * // [{ hub: "support", workflow: "support-reply", name: "answers a refund question", file: "hubs/support/workflows/support-reply.test.yaml", line: 4 }]
 */
export async function listWorkspaceTests(input: TestInput): Promise<TestCaseRef[]> {
  const found = await findTestCases(input);
  return found.map(({ testCase: _, ...ref }) => ref);
}

function matches(ref: TestCaseRef, filter: TestFilter | undefined): boolean {
  if (filter === undefined) return true;
  if (filter.hub !== undefined && filter.hub !== ref.hub) return false;
  if (filter.workflow !== undefined && filter.workflow !== ref.workflow) return false;
  if (filter.name !== undefined && filter.name !== ref.name) return false;
  return (
    filter.contains === undefined ||
    `${ref.hub}/${ref.workflow}/${ref.name}`.includes(filter.contains)
  );
}

/** The line of each case's `name` in the file, or nothing when the text can't be had. */
async function linesOf(
  input: TestInput,
  path: string,
): Promise<(index: number) => number | undefined> {
  const text = input.textOf === undefined ? null : await input.textOf(path);
  const read = text === null ? undefined : readYaml(text);
  if (read === undefined || !read.ok) return () => undefined;
  return (index) => read.value.positionOf(["cases", index, "name"])?.line;
}
