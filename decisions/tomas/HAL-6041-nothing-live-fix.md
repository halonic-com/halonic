# Decision: the nothing-live fix line asks for a first commit

- Approval: wording decided by Sofia (designer) on HAL-6041 (team decision under HAL-2282, no card); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ez47qZglmU+BQlgErauJ1VH+fWn8mmSse55BtSUxXp+v42m8P1+9Zhpx4lZqO0C59RWvd+c8i+yr1hf+EbjMCw==
- Task: HAL-6041, found on HAL-6038 while reading website #153

## What changes

When `halonic run` refuses in a git folder with no commit yet (exit 5), the
fix line changes from:

```text
Commit your changes with git, then run again.
```

to:

```text
Make a first commit in git, then run again.
```

Line 1 ("Nothing is live yet, so there is nothing to run. Nothing ran.") stays
as it is. `cli.run-live-version` quotes the new fix line in its text and its
example, and `live-version.test.ts` checks it.

## Why

0.1.0 is the command line only. The first line, "Make the workspace live in
the Studio", sent people to an app they don't have; HAL-6007 (#1880) already
replaced it with "Commit your changes with git", which reads as if there were
changes to commit. In a folder with no commit yet the step that's missing is
the first commit, so the line says that: in 0.1.0 a first commit is how a
workspace goes live. The doc comment on `nothingLiveFix` says that once the
Studio or a CLI make-live command exists, the line names it.

No test was weakened or skipped: the one changed assertion checks the new
wording with the same `expect` calls.

`cli.commands.routines.watch` is listed under Covers only because its
`expect` count moves from run to run. Its tests put `expect` inside
`vi.waitFor`, so each retry counts as a call: on this pull request's CI run
"starts a routine when it's due" made 10 calls (19 on the merge base) and
"ends with 143 at SIGTERM" made 3 (15). This pull request changes nothing
under `apps/cli/src/commands/routines/`, and the same tests ran and passed on
both sides. The guard only treats such a drop as noise in a package the pull
request doesn't touch, and this one touches `apps/cli`.

## Covers

- cli.run-live-version
- cli.commands.routines.watch
