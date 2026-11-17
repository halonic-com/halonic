# Decision: the Windows package tests run two packages at a time

- Task: HAL-11709
- Approval: Liam reviewed the change on HAL-11709 and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BPUEFnqZoBZIk/XVoq2qpGWerBRNoth8vQUqQS0ljuCyx4xLal3A8p931jL6mUKoY1AeFC7rwJ4Y8vWfElXDAg==

## What changes

In `.github/workflows/ci.yml`, the test step of **Sandbox packages on Windows** passes `--concurrency=2` to Turbo, so
at most two packages run their tests at the same time. No timeout and no test or host code changes.

## Why

On the four-core Windows runner, Turbo's default started eleven packages' tests at once, each with its own Vitest
workers. A test that starts many processes (`cli.local-harness-host` makes about 120 git calls) then stalled past its
30 s timeout, in a different test each time. Fewer packages at once removes that load without hiding a slow test
behind a longer timeout. The job's 30 minute limit stays; the task compares the job's time with earlier runs.

## Covers

- .github/
