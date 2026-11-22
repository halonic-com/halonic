# Decision: the first-run bar's Cancel run failure line says why

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16106 (C671 row 45, a team decision on an approved screen, HAL-2282); Julian signs it, as Liam wrote the pull request
- Kind: user-visible

`first-run.run` quoted the bar's line when the engine can't cancel the first run as "Couldn't
cancel the run. Try again." It now says why, with Studio's shared reasons: "Couldn't cancel the
run: the engine isn't answering. It may still be starting." when the engine can't be reached,
and "Couldn't cancel the run: Halonic ran into a problem it can't explain yet." for any other
failure. The button stays **Cancel run**, and the rest of the requirement is unchanged.

## Why

"Try again" after a failure with no reason can't help the person, and the button beside it is
Cancel run, not Try again (words check C671, row 45). The bar has room for one way out, so it
shows no Copy details; the error stays in the log.

## Covers

- first-run.run
