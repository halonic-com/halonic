# Decision: give out of memory, sandbox start and harness start failures their approved lines

- Task: HAL-10961
- Approval: Liam approved the words and the logic in his review of halonic#3145 and on HAL-10966 (https://paperclip.halonic.com/HAL/issues/HAL-10966). A team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5a64y8lL45VTuBbmZR/0qgScJU5lAXjo/Hjhk5m/NbcAvBUkn9G2zBvPuuRPosIxqlITEP7II1QVPM5ACfwXDQ==

`halonic run` printed the general lines for `model-out-of-memory`, `sandbox-start-failed` and
`harness-start-failed`, because their words were not approved yet. They now print the approved
lines of cli-output 3.4. The requirement `cli.run-failure` no longer lists the three reasons among
those that get the general lines, and the new requirement `cli.run-failed-start-and-memory` covers
their words.

Three table entries of `run-failure-of.test.ts` that expected the general lines for these reasons
are removed, because the reasons now get their own lines. The tests of the new lines are in
`run-failure-of-start.test.ts`. No test was skipped or loosened. The tests that stayed in
`run-failure-of.test.ts` moved their shared fixtures to `src/test/run-failure-fixtures.ts`, so
that the file stays under the 500 line limit.

## Covers

- cli.run-failure
- apps/cli/src/run-failure-of.test.ts
