# A setup done for an older release says `setupAgain`

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

srt on Windows needs a one-time setup as an administrator, and a new srt may
need it again: srt records the setup version on the machine and refuses when
it is older than the one it needs. The adapter reports both "never set up" and
"set up for an older srt" as `setup-needed`, so Studio can't say which. After
an update whose setup prompt was declined, it then says "Windows asks for
administrator rights once", as for a computer that was never set up, where the
team's wording says "This version of Halonic needs the sandbox set up again"
(HAL-14804). We looked at a field on the agent host's `/v1/sandbox/check`
answer only, next to the port. That is smaller, but every other host would
have to copy it, and the agent host's client reads the answer against the
port's shape.

## Decision

**`SandboxCheck.setupAgain` is a new optional flag** on a refusal. An adapter
sets it to `true`, only with `setup-needed`, when the setup was done on this
machine for an older release of the backend than this one needs. An adapter
that can't tell leaves it out. srt sets it on Windows from `srt-win user
status` (`markerVersion` set and lower than `setupVersion`).

**Version 9 of `Sandbox`.** The flag is optional, so no adapter has to change,
but the agent host's client refuses an answer with a key it doesn't know, so a
new host and an old client wouldn't agree. Callers that don't read it keep
working.

## Consequences

- The agent host's client accepts the flag, and also `fix`, which it refused
  until now although the port has carried it since HAL-5393.
- Studio's Agent sandbox section words the declined line from the flag. The
  CLI keeps its words: its fix is the same command either way.
- `sandbox-check-setup-again.test.ts` pins the shape.
