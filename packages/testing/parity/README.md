# @halonicjs/testing-parity

Made-up fixture workspaces and golden recordings of how the old repo (commit
`784f78d`) treats them: which files pass or fail, the error's key path and
line, and the output of the old `validate` command. The compare task checks the
new code against these recordings.

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

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeWorkspace, loadCases } from "@halonicjs/testing-parity";

const scratchDir = mkdtempSync(join(tmpdir(), "parity-"));

for (const parityCase of loadCases("packages/testing/parity/fixtures")) {
  composeWorkspace(
    "packages/testing/parity/fixtures",
    parityCase,
    `${scratchDir}/${parityCase.id}`,
  );
}
```
