# Decision: clearer CLI messages for trust without a terminal, init --dir and serve on a port in use

- Requirement: `cli.commands.trust.review-and-trust` (`apps/cli/src/commands/trust/requirements/review-and-trust.md`), `cli.commands.init.create-workspace` (`apps/cli/src/commands/init/requirements/create-workspace.md`), `cli.commands.serve.serve` (`apps/cli/src/commands/serve/requirements/serve.md`)
- Task: HAL-14262
- Approval: HAL-14262, Liam's approval of Kim's wording from the first-run error check on HAL-14245 (C5, C7, C8)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:tlDv+tm5WXSsJkXYmk4fHWXSSiXvuCn/KWI1ZmhBq8tD3BGAGexIk0PKGYVjSd+vOlvamBIdN1GvyHBcj+vVAA==

## What changes

The three requirements are edited, not retired.

- `halonic trust` with no terminal: the fix line was "Review it with halonic trust, then pass --yes --fingerprint <fingerprint>." It is now "Read the list above, then run: halonic trust --yes --fingerprint hfp1:…", with the real fingerprint and the user's `--dir` filled in, so it can be copied as it is.
- `halonic init --dir x`: still wrong usage, exit 2, but the fix line is now the same command line with the folder first, such as "Give the folder as the first argument: halonic init x --example acme.".
- `halonic serve` on a port another program listens on: it stops with the conflict exit 5 and "port 4747 is in use by another program. Stop it, or pick another port with --port 4748.", instead of the unexplained error.

## Why

Kim's first-run error check found these three messages left a new user guessing. The fingerprint was already known, the right `init` command line is known from what was typed, and a port in use is a common, fixable case.

## Tests

No test was weakened, skipped or removed. The tests of the old trust fix line now check the new line with the fingerprint; new tests cover `init --dir` and the port in use, and name their requirements.

## Covers

- cli.commands.trust.review-and-trust
- cli.commands.init.create-workspace
- cli.commands.serve.serve
