# Decision: every sandbox backend passes a trust check before it runs steps

- Approval: Paperclip task HAL-5392, built on the HAL-3779 design (sections 2.2-2.4 and 6) that Liam wrote; he approves this note in review
- Kind: internal

## What changes

`app.sandbox-choice` ran a trust check (the canary session) only for a backend that had a canary,
which in practice was MXC. Now every backend the host hands over has one: `SandboxBackend.canary`
is required, the choice refuses to be created for a backend without one, and srt, srt-wsl and the
others run the same trust check as MXC before they run steps. A failed trust check still keeps the
backend off until the next start, nothing falls through to another backend, and `not-fenced` still
re-checks. Nothing is weakened: the only change is that the check applies to more backends.

## Covers

- app.sandbox-choice
