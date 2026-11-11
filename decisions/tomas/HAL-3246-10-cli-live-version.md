# Decision: the git adapter's testGit as a test-only entry point

- Approval: a new entry in `extraExports` of `tooling/check/policy.json` needs the maintainer's review; Liam approves this note in his review of the CLI live-version pull request on [HAL-3246](/HAL/issues/HAL-3246)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XrcYtOSlzAeRi+HPmsXqKb/7Pj7BiTlhwZPs+aneKx0LwDz7bdCTv27CmAmkIf6/78b6prWQiICKUswI28SiAA==
- Task: HAL-3246

## What changes

`tooling/check/policy.json` gains one `extraExports` entry: `@halonicjs/adapter-git` may export
`./testing`. That entry holds `testGit()`, moved from the adapter's own test fixtures, not
copied. The adapter's tests import it from there as before.

## Why

`halonic run` now reads the workspace's live version through `GitVcs` (HAL-3246, step 3), and
the CLI's tests need a real repository to show it. `GitRunner` refuses a wrapper script found as
`git` on the `PATH`, as on an agent runner, so the tests must pass git itself, which
`testGit()` finds from git's `--exec-path`. The other ways were worse:

- a copy in the CLI's test folder starts a process with `node:child_process`, which the
  process-starts guard rightly refuses outside the listed files;
- exporting it from the adapter's main entry would put a test helper in its public API.

Only tests import `./testing`; the README says so.

## Covers

- tooling/check/
