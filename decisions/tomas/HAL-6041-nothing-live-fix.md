# Decision: the nothing-live fix line asks for a first commit

- Approval: wording decided by Sofia (designer) on [HAL-6041](/HAL/issues/HAL-6041) (team decision under HAL-2282, no card); Liam approves this note in review
- Kind: internal
- Task: HAL-6041, found on HAL-6038 while reading website #153

## What changes

When `halonic run` refuses in a git folder with no commit yet (exit 5), the
fix line changes from:

```text
Make the workspace live in the Studio, then run again.
```

to:

```text
Make a first commit in git, then run again.
```

Line 1 ("Nothing is live yet, so there is nothing to run. Nothing ran.") stays
as it is. `cli.run-live-version` quotes the new fix line in its text and its
example, and `live-version.test.ts` checks it.

## Why

0.1.0 is the command line only, so the old line sent people to an app they
don't have. In 0.1.0 a first commit is how a workspace goes live. The doc
comment on `nothingLiveFix` says that once the Studio or a CLI make-live
command exists, the line names it.

No test was weakened or skipped: the one changed assertion checks the new
wording with the same `expect` calls.

## Covers

- cli.run-live-version
