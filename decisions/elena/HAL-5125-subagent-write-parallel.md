# Decision: say that a subagent's OK under a parallel branch ends the branch

- Approval: follow-up Liam asked for in his review of PR 1626 ([HAL-4987](/HAL/issues/HAL-4987)), tracked on [HAL-5125](/HAL/issues/HAL-5125); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:W/ydTPWeXX/qzch19VS2SLqq3TgkvnzzPC3RzcXq0o4U8jKXRMjKmNLCtPm6iWFDWD//68gmEnOpgkOAeJhyBw==

## What changes

`engine.subagent-tools` said that a subagent's call that needs an OK stops the run at the
`delegate_` call, "as for the state's agent". Under a `parallel` branch that isn't what happens:
a branch can't wait (`engine.parallel-state`), so the branch ends at that call with the error its
own agent would get, and nothing is called. That has been the behaviour since PR 1626; the
requirement now says it and gains an example for it. No engine code changes.

## Tests

`local-runs-agent-tools.test.ts` gains one test under `engine.subagent-tools`: a `writer` in a
`parallel` branch delegates to a `checker` that calls `publish`, a Halonic tool that can write.
The branch ends with an error naming `publish`, no `approval.requested` is logged, `publish`
doesn't run and the run goes on. No test is removed, skipped or changed.

## Covers

- engine.subagent-tools
