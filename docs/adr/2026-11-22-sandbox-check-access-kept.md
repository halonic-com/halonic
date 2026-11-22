# Access a removal with administrator rights left says `accessKept`

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

A removal of the Windows sandbox that runs with administrator rights can't
take back the access srt kept on the user's folders. When srt still lists its
sandbox account afterwards (`keptAccess: "manual"`, HAL-15836), only a removal
without administrator rights takes it back. Settings then shows **Needs
setting up**, which offers no **Remove the sandbox…**, so people had to set up
the sandbox they had just removed only to remove it again (HAL-15850). Settings
needs to know about the kept access after a restart, and after a removal from
the CLI or the uninstaller too. We looked at Studio remembering the last
removal's `keptAccess` itself. That misses the other two ways to remove, and
it goes stale once something else takes the access back. srt's own status
(`srt-win user status`) already lists the kept grants, and outlives restarts.

## Decision

**`SandboxCheck.accessKept` is a new optional flag** on a refusal. An adapter
sets it to `true`, only with `setup-needed`, when the backend still keeps
access to the user's folders that a removal with administrator rights left.
An adapter that can't tell leaves it out. srt sets it on Windows when
`srt-win user status` lists kept grants while its sandbox account is still
there. A status that can't be read sets nothing, so a computer where srt
doesn't answer isn't offered a removal it doesn't need.

**Version 11 of `Sandbox`**, for the same reason as `setupAgain` (version 9):
the agent host's client refuses an answer with a key it doesn't know.

## Consequences

- Settings › Agent sandbox offers **Remove the sandbox…** under **Needs
  setting up** while the flag is set (`settings.agent-sandbox-state`). Its
  manual line no longer tells people to set the sandbox up again first.
- Only a removal from a Halonic started without administrator rights takes the
  access back, so the line still says to open Halonic normally. A removal from
  a Halonic started as administrator keeps the access again, and the flag
  stays.
- `sandbox-check-access-kept.test.ts` pins the shape.
