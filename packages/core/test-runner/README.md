# @halonicjs/test-runner

Runs a workspace's workflow tests (`<workflow>.test.yaml`) in an engine it is given, and returns
each test's result as data: passed or failed, why it failed, and the runs it made.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/test-runner`

The runner has no adapters, files or network of its own. The caller passes everything in
(`TestDeps`): the scripted model each case talks to, fresh stores for each case, the clock each
case's test clock starts from, and, when it has any, Halonic's own tools the runs offer
(`halonicTools`, such as knowledge search). `halonic test` passes the mock model and in-memory stores; the parity
checks pass a fixed clock.

A result never holds printed text. Each failure (`TestFailure`) carries what the CLI needs for its
"Expected …, but …" sentence: the expected and actual step, steps, status or value, and the case's
file and line. Each result also has the runs the case made, with their summaries and events, in the
shape of the parity recordings.

`listWorkspaceTests` lists the cases without running them, for `halonic test --list`, with the same
filter the run takes: hub, workflow and name, each matched exactly. Parsing `--filter` into
those is the CLI's job.

Running the tests comes in the next pull request (HAL-4215): for now the package lists cases and
defines the types and the dependencies a run takes, and nothing in it starts a run. The `artifacts`
expectation will be checked against the run's `artifact.created` events, which the engine logs when
a task state saves its answer.

## Known gaps

- A test file can now script a program step's results (the case's `programs` key, in
  `@halonicjs/format`), but the runner doesn't read it yet, because nothing in it starts a run
  (HAL-4215, HAL-4248). Once it does, a step that would start a program with no scripted result
  fails its case with `unscripted-program`. The runner tells such a step by the run's
  `harness-unavailable` failure reason, never by the engine's error text.

## Example

List the test of a small in-memory workspace named "without a decision the run waits". The code lives in
[`examples/list-tests.ts`](examples/list-tests.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name; outside this package, import `@halonicjs/test-runner` as
below.

```ts
import type { DefinitionSource } from "@halonicjs/ports";
import { loadWorkspace } from "@halonicjs/workspace";
import { listWorkspaceTests } from "@halonicjs/test-runner";

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
```
