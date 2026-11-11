# @halonicjs/test-runner

Runs a workspace's workflow tests (`<workflow>.test.yaml`) in an engine it is given, and returns
each test's result as data: passed or failed, why it failed, and the runs it made.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/test-runner` (`runWorkspaceTests`, `listWorkspaceTests` and their types)

The runner has no adapters, files or network of its own. The caller passes everything in
(`TestDeps`): the scripted model each case talks to, fresh stores for each case, the clock each
case's test clock starts from, and, when it has any, Halonic's own tools the runs offer
(`halonicTools`) and the knowledge factories that build the sources an agent's `knowledge:` lists,
with what each source is built with (`knowledge`). `halonic test` passes the mock model and
in-memory stores; the parity checks pass a fixed clock.

A result never holds printed text. Each failure (`TestFailure`) carries what the CLI needs for its
"Expected …, but …" sentence: the expected and actual step, steps, status or value, and the case's
file and line. Each result also has the runs the case made, with their summaries and events, in the
shape of the parity recordings.

`listWorkspaceTests` lists the cases without running them, for `halonic test --list`, with the same
filter the run takes: hub, workflow and name, each matched exactly, and `contains`, text the
case's `hub/workflow/name` holds. `halonic test --filter <text>` passes its text as `contains`.

`runWorkspaceTests` runs the cases the filter keeps, one after the other, each on an engine of its
own: fresh stores, a test clock that starts at the given clock's time and moves only on
`{ advance }`, the scripted model made from the case's `mocks`, connectors that answer from its
`tools`, and programs that answer from its `programs`. Each case's run is the `test` run `test_1`. A failed test is a result, never an error.

The expectations follow the old runner: `context` is a partial match (objects key by key, arrays
whole), `artifacts` means "at least these" and is checked against the run's `artifact.created`
events, `final` without `status` expects the run to finish, and a run that fails with no `status`
that allows it fails its test. A scripted reply to an agent whose output is a `choice` must be one of
its options, in a `task`, a `parallel` branch or a `foreach` item alike: any other answer fails the
run, or the branch, with `answer-not-an-option` (`engine.task-choice-answer`). On top of `expect`, a case fails on scripted replies, tool results or
program results its runs never used, on a tool call or program start it has no result for, and on an
event its run doesn't take.

A step whose agent runs in a program harness (`claude-code` or `codex`) never starts a real
program: each start of an agent's program takes the agent's next `programs` result, in the order the
engine starts them (item order in a `foreach`). A text result or `{ output }` is the program's
output; `{ fails }` fails the run with its message. A start with no result left fails the case with
`unscripted-program`, naming the step and the agent.

## Differences from the old runner

The old runner had nine suites (acme, foreach, gets, hubs, knowledge, legacy, parallel, subflows,
timers). Three of them, gets, subflows and timers, run through `runWorkspaceTests` in `src/ported/`
so far; the other six are still to port (requirement `test-runner.old-suites`, HAL-4448). Where the
new code does something else, the ported test leaves that part out, and it is listed here:

- The runner builds a knowledge source only through the factories the caller passes in
  `TestDeps.knowledge`, so without them an agent's `knowledge:` gives it nothing in a test
  (`test-runner.run-tests`, HAL-4458).
- A workspace from before the renames (`org.yaml`, `projects/`, `flows/`) doesn't load, so it runs
  no test (`workspace.load`).
- A run's log doesn't hold a subagent's turn or a call to a tool that only reads, so the ported
  tests read those from the model's requests (`engine.turn-logs-events`).
- The model sees a connector's tools by their own names (`search_issues`), not
  `<connector>__<tool>`; a case still scripts them as `<connector>.<tool>`.

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
