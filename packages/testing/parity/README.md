# @halonicjs/testing-parity

Made-up fixture workspaces and golden recordings of how the old repo (commit
`784f78d`) treats them: which files pass or fail, the error's key path and
line, and the output of the old `validate` command. The compare in
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

## The compare

For every file the old loader read, in the base and in every case, the
compare takes the old result from `recorded.json` and the new one from
`parseFile`, and compares them exactly: pass or fail, then each error's key
path, code, line and column, in order. Nothing is dropped or rounded. A YAML
syntax error is compared by its line and column, with the code `syntax`.
Errors the old loader found between files (an unknown agent, a workflow rule)
are kept with the file for the report; the new loader checks those in
phase 2, so only the file's own result is compared now.

`format`'s `parity.test.ts` runs it, because this package can't depend on
`format` (`format` already uses the fixtures):

```ts
const report = judge(
  fileChecks(fixtures).map((file) => compareFile(file, parseFile(file.kind, file.text))),
  readAllowedDifferences(allowedDifferencesFile),
);
// Passes only when report.unexplained and report.stale are both empty.
```

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

# 2. Record (about 2 minutes: the old validate runs once per case).
pnpm --filter @halonicjs/testing-parity record --old <scratch>/halonic-old

# 3. One case only:
pnpm --filter @halonicjs/testing-parity record --old <scratch>/halonic-old --case routine/bad-cron
```

`<scratch>` must be an absolute path: pnpm runs the script inside the package folder.
The recorder refuses a clone at another commit, with changed files, or without
`pnpm install`. It builds each case's workspace in a temporary folder, runs
`src/old-runner.ts` with the old repo's own `tsx`, and deletes the folder after.
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
