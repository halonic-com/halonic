# @halonicjs/testing-parity

Made-up fixture workspaces and golden recordings of how the old repo (commit
`784f78d`) treats them: which files pass or fail, the error's key path and
line, the output of the old `validate` command, and on the base the old
`test` and `run` commands with their full event logs. The compare in
`src/compare/` checks the new code against these recordings.

- **Layer:** testing
- **Owner:** julian
- **Public API:** `@halonicjs/testing-parity`

## The fixtures

All fixtures are made up (`acme`-style). No real or private workspace is ever
copied here.

```
fixtures/
  base/
    case.json         what the fixture is
    files/            a valid workspace with every file kind
    recorded.json     the old repo's behaviour on it (golden)
    run-logs.json     the old runner's run logs of its 8 workflow tests (golden)
    cli.json          the old CLI's test and run calls: output and event logs (golden)
  cases/<kind>/<name>/
    case.json         the kind, the fault, and where the fault is
    files/            only the files that differ from the base
    recorded.json     golden
  old-line-notes.json generated: every case where the old line differs
  OLD-LINES.md        what those differences are, in words
```

The **base** holds one valid file or more of each of the 14 kinds the old schema
and loader accept: `workspace`, `deployments`, `models`, `provider`, `runtime`,
`knowledge`, `collection`, `connector`, `skill`, `hub`, `agent`, `workflow`,
`workflowTest` and `routine`. Its workflows cover foreach (over an agent and
over a nested workflow), parallel branches, a nested workflow, an approval that
expires after a timer, and the workspace has a budget. Its 8 workflow tests
pass in the old repo.

A **case** is the base with some files replaced, added or removed
(`"remove": [...]`). It breaks one thing on purpose, named by its `fault`:
`wrong-type`, `unknown-key`, `missing-required`, `bad-enum`, `bad-format`,
`deep-nesting`, `yaml-syntax`, `reference` or `rule`; or `valid` for a case
that should load. `expect` says where the fault is, the way a person would
want to be sent there:

- a wrong value: the line of its key
- an unknown key: the line of that key
- a missing key: the line of the key that owns the map (the first line of the
  file at the top level)
- a reference or a workflow rule: the line of the value or state that is wrong
- a missing file: `null`

## A recording

`recorded.json` holds, for the case's own files (all files for the base):

- `status`: `pass`, `fail` or `not-read` (the old loader skipped the file)
- `schema`: the file kind whose schema checked it
- `issues`: each schema issue with its key `path` as a list, its `code`,
  `message`, `line` and `col`
- `diagnostics`: everything the old loader reported for the whole workspace,
  in its order, with lines where it gave them
- `validate`: exit code and output of the old `studio validate`
- `line`: the expected line, the recorded line and the verdict (`same`,
  `different`, `no-line`, `no-error`)

The validate output carries no time and no run IDs. The recorder still checks
this and refuses to write output that does, so a later change can't slip a
clock into the goldens. It runs the old code with `TZ=UTC`, `LANG=C` and an
empty home folder, so nothing from the person's own settings is read.

## Run logs

For the base only, the recorder also runs its 8 workflow tests with the old
test runner (`runCase`) and writes `run-logs.json`. For each test it holds
whether the old runner passed it, its failures, and every run the test started
(its own and those of nested workflows), each with the old run summary and all
its events in order. These are the goldens for the engine's parity check.

Times and IDs are fixed, so the logs are the same on every machine:

- IDs come from the old `fixedIds`, fresh for each test: the test's own run is
  `test_1`, nested runs follow as `test_2`, `test_3` and so on.
- The clock stands still at `2026-01-01T00:00:00.000Z` (`clock` in the file)
  and moves only on a test's `advance` steps, so a timer of `2d` fires at
  `2026-01-03T00:00:00.000Z`. The run logs don't depend on how often the old
  engine reads the clock.
- `Date.now` reads the same time while a test runs, because the old engine
  times model calls with it; `latencyMs` is therefore always `0`.

The runner runs every test twice and stops, naming the test, if the two logs
differ. The recorder refuses a log with a random old run ID.

## CLI output

For the base only, the recorder also runs the old CLI (`studio test` and
`studio run`, as `apps/cli/src/main.ts`) with the calls in
[`src/cli-calls.ts`](src/cli-calls.ts), and writes `cli.json`. `studio
validate` isn't repeated there: every case's `recorded.json` already holds its
output. For each call `cli.json` holds the arguments, the exit code, stdout,
stderr, every run the call stored (`.studio/runs/<id>.jsonl`) with all its
events in order, and every file it wrote under `.studio`.

The old CLI reads the system clock and makes its run IDs from the clock and
random bytes; nothing can be passed in. So each call runs in its own process
with [`src/old-cli-preload.ts`](src/old-cli-preload.ts) loaded first:

- The clock stands still at `2026-01-01T00:00:00.000Z` for the whole call, so
  every event is at that time, a 2-day timer waits until
  `2026-01-03T00:00:00.000Z`, and a model reply takes `0 ms`.
- The random source counts up, so the old IDs come out as
  `run_<fixed time>_00000001` and so on. The recorder renames them to
  `run_1`, `run_2`, ... (`test_1`, ... for test runs) in the order they were
  made, starting again for each call.

Each call runs on a fresh copy of the workspace, twice. The runner stops,
naming the call, if the two differ; the recorder refuses a random run ID or a
time more than 30 days from the fixed clock.

What the calls show:

- `studio test` passes all 8 tests. Unlike `run-logs.json`, where each test
  counts from `test_1`, the CLI keeps one run store for the whole command, so
  its 15 runs are `test_1` to `test_15`.
- `studio run` has no model script, so the mock model echoes the input, and
  the `checker` agent fails because the echo isn't JSON.
- A run with an event its state doesn't accept fails after the run started:
  the run is stored, stdout is empty, and the error is on stderr.
- The `invoice` workflow doesn't start: its mailbox connector isn't signed in
  (`Not started: Sign in billing@example.com first (Inbox).`, exit 1).
- The old CLI exits 1 for every error, a usage error included.
- **A foreach with more than one item and `concurrency: 2` isn't recorded
  through the CLI.** With the file run store, the order of its child runs and
  events changes from run to run, so `run a foreach over a nested workflow`
  uses one line. `run-logs.json` has the 3-line batch, in the memory store,
  where the order is stable.

### Where the old CLI output meets an allowed difference

The new `halonic test` and `halonic run` are compared against `cli.json` (see
[CLI calls](#cli-calls) under The compare). Where the old output depends on
something listed as a difference or a gap:

- **Trust (`not-trusted`, exit code 3).** The old CLI has no trust gate: every
  recorded run starts without a trust check. The parity run trusts the
  fixture through the memory `TrustStore`, so no call meets exit code 3 or a
  `not-trusted` step, and the compare never turns a 3 into anything else.
- **Approvals routed by `callId` (E5).** None of the recorded calls approves a
  tool call, so no `callId` and no approval list appear in `cli.json`.
- **The three optional event fields.** The 3 `run.failed` events have no
  `reason`; the new engine adds it (`failed-run-says-why`). No tool results or
  resolved approvals appear.
- **Exit codes.** The old CLI exits 1 for every error; the new one exits 2
  for a wrong command line or input and 4 for an unknown workflow
  (`cli-exit-codes-by-error-kind`).
- **The words.** stdout and stderr come from the new message catalogue, so
  none of the old words is compared (`cli-output-from-the-catalogue`).
- **`studio test` stored its runs; `halonic test` stores none**
  (`test-runs-stay-in-memory`). Those runs are compared test by test in the
  run-log compare.
- **The signed-out connector** is a known gap: the old CLI refused to start
  the `invoice` workflow, the new one starts it (HAL-5291).

## The compare

For every file the old loader read, in the base and in every case, the
compare takes the old result from `recorded.json` and the new one from
`parseFile`, and compares them exactly: pass or fail, then each error's key
path, code, line and column, in order. Nothing is dropped or rounded. A YAML
syntax error is compared by its line and column, with the code `syntax` and
the path `[]` on both sides. Warnings are left out, and a new result that isn't
ok fails even when it holds only warnings.
Errors the old loader found between files (an unknown agent, a workflow rule)
are kept with the file for the report and compared on their own, below.

`format`'s `parity.test.ts` runs it, because this package can't depend on
`format` (`format` already uses the fixtures):

```ts
const report = judge(
  fileChecks(fixtures).map((file) => compareFile(file, parseFile(file.kind, file.text))),
  readAllowedDifferences(allowedDifferencesFile),
);
// Passes only when report.unexplained and report.stale are both empty.
```

### Checks between files

For every fixture, the compare also takes each message the old loader gave
from a check between files: an unknown name, a workflow rule, a routine's
trigger, an old layout. It groups them by the file on disk they are about,
each file's in the order `recorded.json` lists them, and compares them with
the new loader's, file by file in path order: the same severity and words, in
the same order. Files the old recording shows failed on their own are left
out on both sides, as the compare above checks those. The old
loader named some files by an older path (a hub's routines under
`hubs/<hub>/routines/`); the base's recording maps each to its path on disk.

`workspace`'s `parity.test.ts` runs it with `loadWorkspace`:

```ts
const comparisons = [];
for (const checkCase of checkCases(fixtures)) {
  const workspace = await loadWorkspace(sourceOf(checkCase.parityCase));
  const fresh = checksByFile(workspace.issues.filter((issue) => issue.source === "check"));
  comparisons.push(...compareChecks(checkCase, fresh));
}
const report = judgeChecks(comparisons, readAllowedDifferences(allowedDifferencesFile));
```

### Run logs

For the base, the compare also checks the new test runner's run logs against
`run-logs.json`. Core/test-runner's `parity.test.ts` runs the base's 8 workflow
tests through `runWorkspaceTests`, from the same fixed clock, and feeds the
results in:

```ts
const report = judgeRunLogs(
  pairRunLogs(readRunLogs(base), suite.tests),
  readAllowedDifferences(allowedDifferencesFile),
  readKnownGaps(knownGapsFile),
);
// Passes only when report.unexplained and report.stale are both empty.
```

Tests are paired by `<hub>/<workflow>/<name>` and compared exactly: pass or
fail, the number of failures (the old ones are sentences, the new ones data;
the CLI's message catalogue checks the words), and every run's summary and
events in order. Before that, the compare applies the **run-log rules** that allowed
differences name in `runRules`. Each rule, in `src/compare/run-rules.ts`,
takes out or reorders one thing on the side it names, such as the run IDs
(`run-ids-by-start` names both sides' runs `run_1`, `run_2`, ... in start
order) or `definitionsVersion`. A rule that changes no test is stale.

A test that still differs fails, unless `known-gaps.json` names it. A **known
gap** is a place where the new engine is still wrong, with the task that fixes
it: unlike an allowed difference, it says the new behaviour has to change. A
gap whose tests match is stale, so each fix removes its gap and the list only
shrinks.

### CLI calls

For the base, the compare also checks the new CLI against `cli.json`. The
CLI's `parity.test.ts` (`apps/cli`) makes each call of
[`src/cli-calls.ts`](src/cli-calls.ts) again, as its `halonic` arguments say,
on a fresh copy of the base with a profile of its own: the clock stands at the
old fixed time, IDs count from 1, the fixture is trusted through the memory
`TrustStore`, and nothing goes online. It feeds the results in:

```ts
const report = judgeCliCalls(
  pairCliCalls(readCliRecording(base), calls),
  readAllowedDifferences(allowedDifferencesFile),
  readKnownGaps(knownGapsFile),
);
// Passes only when report.unexplained and report.stale are both empty.
```

Calls are paired by name and compared exactly: the exit code, stdout, stderr,
and every run the call stored, with all its events in order. The new runs come
from the profile's run store and are put in the order they started: each run
nothing stored started, then the runs it started. Before that, the compare
applies the **CLI rules** that allowed differences name in `cliRules`, from
`src/compare/cli-rules.ts`: the CLI's own (the words, the exit codes, the
test runs, the failure words) and every run-log rule, applied to a call's
runs. A call that still differs is judged as a test is: a gap when a known gap
names it in `calls`, and different otherwise; stale rules and gaps fail.

## Allowed differences

`allowed-differences.json` is the one file that lists where the new repo may
behave differently from the old one. Each entry has:

- `id`: a stable kebab-case name
- `requirement`: the requirement ID that explains the difference, for example
  `contracts.run-store`
- `area`, `old`, `new`, `why`: what it is about, what `784f78d` did, what the
  new repo does, and why that is right, in plain words
- `status`: `proposed` until the maintainer signs it off in review, then `signed-off`
- `fixtures`, only where the difference shows in the parity fixtures: each
  fixture file (`case` and `file`) with its `old` and `new` result written out
  in full, as the compare sees them. The compare allows exactly that
  difference. An entry whose file no longer differs, or differs in another
  way, is stale and fails the compare
- `checks`, only where the difference shows in the checks between files: each
  fixture file (`case` and `file`, or a folder for an old layout) with its
  `old` and `new` messages (`severity` and `message`) written out in full and
  in order. It is judged the same way as `fixtures`
- `runRules`, only where the difference shows in the base's run logs: the ids
  of the run-log rules it allows. A rule the compare doesn't have, or one two
  entries name, is refused
- `cliRules`, only where the difference shows in the base's CLI calls: the ids
  of the CLI rules it allows, checked the same way

Every fixture, the base's valid file of each kind and at least one invalid case
per kind, has a recording from the reference commit.

The compare code, `src/allowed-differences.ts` and `allowed-differences.json`
are guarded: a change could make parity pass by comparing less.

`readAllowedDifferences` refuses a malformed entry, an unknown field or a
repeated id, and names the entry. A new entry always starts as `proposed`.

## Re-recording

Only needed when fixtures change. Never record from the user's own folder:
always use a scratch clone **outside** it.

```sh
# 1. A scratch clone of the old repo, at the reference commit.
git clone <old repo> <scratch>/halonic-old
git -C <scratch>/halonic-old checkout 784f78d
# If git refuses the old repo because of who owns its folder, bundle it instead:
#   git -C <old repo> -c safe.directory=<old repo> bundle create <scratch>/old.bundle HEAD
#   git clone <scratch>/old.bundle <scratch>/halonic-old
(cd <scratch>/halonic-old && pnpm install --frozen-lockfile)

# 2. Record (about 3 minutes: the old validate runs once per case, and each
#    of the base's CLI calls twice).
pnpm --filter @halonicjs/testing-parity record --old <scratch>/halonic-old

# 3. One case only:
pnpm --filter @halonicjs/testing-parity record --old <scratch>/halonic-old --case routine/bad-cron
```

`<scratch>` must be an absolute path: pnpm runs the script inside the package folder.
The recorder refuses a clone at another commit, with changed files, or without
`pnpm install`. It builds each case's workspace in a temporary folder, runs
`src/old-runner.ts` with the old repo's own `tsx`, and deletes the folder after.
Make the clone on a fast local disk: on a slow network drive, cloning and
installing take many minutes. `--case base` re-records only the base, with
its run logs and CLI output (about 1 minute).
The 3 uncommitted changes in the user's copy of the old repo are documents and
aren't part of the reference; a clean clone at `784f78d` leaves them out.

Changed golden files need a decision note once the requirement guard is
active.

## Example

Loads one fixture and compares a result against its golden recording. This
example is [`examples/compare-one-fixture.ts`](examples/compare-one-fixture.ts),
which `src/example.test.ts` runs and checks.

```ts
import { join } from "node:path";
import { caseFileChecks, compareFile, type NewResult, readCase } from "@halonicjs/testing-parity";

/** The fixtures that ship with this package: a valid base workspace and made-up faulty cases. */
const fixtures = join(import.meta.dirname, "../fixtures");

/** Compares what new code says about one fixture file against the old repo's golden recording. */
export function runExample(): string[] {
  // The "agent/unknown-key" case: a method with a key the schema doesn't know.
  // Reading just this case is quick; `fileChecks(fixtures)` reads every fixture.
  const unknownKey = readCase("agent/unknown-key", join(fixtures, "cases/agent/unknown-key"));
  const [check] = caseFileChecks(fixtures, unknownKey);
  if (check === undefined) throw new Error("the fixture is missing");

  // What the golden recording holds for the file: the old repo failed it on `methods.extract`, line 13.
  const [golden] = check.recorded.issues;

  // New code that reports exactly the golden error. In a real parity test this is `parseFile(kind, text)`.
  const sameError: NewResult = {
    ok: false,
    error: [
      {
        severity: "error",
        source: "schema",
        code: golden?.code ?? "",
        path: golden?.path ?? [],
        line: golden?.line ?? 0,
        col: golden?.col ?? 0,
      },
    ],
  };
  // New code that reports the same error one line further down: the compare is exact, so this differs.
  const movedError: NewResult = {
    ok: false,
    error: sameError.ok
      ? []
      : sameError.error.map((problem) => ({ ...problem, line: problem.line + 1 })),
  };

  const same = compareFile(check, sameError);
  const moved = compareFile(check, movedError);
  return [
    `${check.name}: golden says ${golden?.code} at line ${golden?.line}`,
    `same error: ${same.same ? "matches" : "differs"}`,
    `error one line further down: ${moved.same ? "matches" : "differs"}`,
  ];
}
```

## Requirements

- [`parity.fixtures-cover-every-kind`](requirements/fixtures-cover-every-kind.md)
- [`parity.case-description-checked`](requirements/case-description-checked.md)
- [`parity.compose-case-workspace`](requirements/compose-case-workspace.md)
- [`parity.line-verdict`](requirements/line-verdict.md)
- [`parity.record-only-from-reference`](requirements/record-only-from-reference.md)
- [`parity.recording-is-machine-free`](requirements/recording-is-machine-free.md)
- [`parity.runner-traces-old-loader`](requirements/runner-traces-old-loader.md)
- [`parity.runner-records-test-run-logs`](requirements/runner-records-test-run-logs.md)
- [`parity.runner-records-cli-output`](requirements/runner-records-cli-output.md)
- [`parity.compare-exact`](requirements/compare-exact.md)
- [`parity.compare-loader-checks`](requirements/compare-loader-checks.md)
- [`parity.compare-runs-on-fixtures`](requirements/compare-runs-on-fixtures.md)
- [`parity.allowed-differences-checked`](requirements/allowed-differences-checked.md)
- [`parity.allowed-fixture-differences`](requirements/allowed-fixture-differences.md)
- [`parity.compare-run-logs`](requirements/compare-run-logs.md)
- [`parity.known-gaps-checked`](requirements/known-gaps-checked.md)
- [`parity.compare-cli-calls`](requirements/compare-cli-calls.md)
