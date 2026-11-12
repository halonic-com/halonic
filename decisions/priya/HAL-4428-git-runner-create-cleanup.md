# Decision: a failed `GitRunner.create` removes the hooks folder it made

- Requirements: `git.runner-close` (`packages/adapters/git/requirements/runner-close.md`)
- Task: HAL-4428 (found in the review of #1395, HAL-4420)
- Approval: HAL-4428, the CTO's review of this pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2I2uaXWLVGpRJ+0disC1RR4wvTiG1z1Hd9CblbOYE9LXu+r7ll4/4ds+BwjKkTCjOyI8nXgLTE0XIA0QRUFuAw==

## What changes

The requirement gets one sentence and one example. When creating a runner fails after the runner
made its own temporary hooks folder, it removes that folder before it reports the failure. A hooks
folder the caller gave is still never touched. `GitRunner.create` now runs its checks in a `try`
and closes the runner before it rethrows.

## Why

Since #1395, `create` can refuse the git program after `mkdtemp` (a wrapper that drops the
hardening config). The caller then never gets a runner to `close()`, so each refused call left an
empty `halonic-git-hooks-…` folder in the temporary folder.

## Tests

No test was weakened. One new test: it points `TMPDIR` at a scratch folder, has `create` refuse a
wrapper that unsets `GIT_CONFIG_COUNT`, and checks the folder is empty afterwards. It fails without
the fix. It runs only outside Windows (`it.runIf(process.platform !== "win32")`), because the
wrapper is a `#!/bin/sh` script, the same as the wrapper tests in `find-git.test.ts` from #1395.
The fix itself has no platform-specific code.

## Covers

- `git.runner-close`
- `packages/adapters/git/src/git-runner.test.ts`
