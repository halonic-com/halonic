# Decision: every coding tools answer drops secrets, and one run_tests test is POSIX-only

- Approval: Paperclip task HAL-16752, Liam's security review of #5444 (23 Nov)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vqiz4sLuS4G3tvKut+yongBx+SWMkqtRLPrGl/bvf0JmY9LRL+ICO8PzWOB3Ls9qFFjSLXaQEKQkncK5DumpBw==

Liam's review asked that no tool answer can give back a secret, since
`read_ranges` can read `run_tests`' raw log. So the requirement
`coding-tools.tool-set` now says that every answer, error results included,
has the secret values removed, and that `read_ranges` removes them from each
line before cutting it. It only adds to what the requirement asked; nothing
is taken out. The package isn't wired into any run yet, so no user sees this.

One new test is skipped on Windows: `start-command.starts.test.ts`, "stops
what the command left running once it exits". Windows has no process groups,
so there a test command's leftover processes are stopped only at the timeout
or on a cancel, which the tests next to it cover on every platform. No
existing test is skipped or weakened.

## Covers

- coding-tools.tool-set
- packages/adapters/coding-tools/src/run-tests/start-command.starts.test.ts
