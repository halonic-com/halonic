# Decision: the first-run bar's Cancel run failure line says why

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16106 (C671 row 45) and https://paperclip.halonic.com/HAL/issues/HAL-16133 (C676 row 3), team decisions on an approved screen, HAL-2282; Julian signs it, as Liam wrote the pull request
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:6SQ4K053u++uSoC4bb5VTX3tCbYuuQ34HjkFcQmljc6hOaTFIW0eHFCakW8C+UeBkynVzctgDmHqpX9DBjpEBw==

`first-run.run` quoted the bar's line when the engine can't cancel the first run as "Couldn't
cancel the run. Try again." It now says why, with Studio's shared reasons: "Couldn't cancel the
run: the engine isn't answering. It may still be starting." when the engine can't be reached,
"Couldn't cancel the run: this workspace isn't trusted yet." with **Review**, which opens the trust
check, when the engine refused because the workspace isn't trusted (after Remove trust), and
"Couldn't cancel the run: Halonic ran into a problem it can't explain yet." for any other
failure. The button stays **Cancel run**, and the rest of the requirement is unchanged.

## Why

"Try again" after a failure with no reason can't help the person, and the button beside it is
Cancel run, not Try again (words check C671, row 45). The bar has room for one way out, so it
shows no Copy details; the error stays in the log. After Remove trust the engine refuses a
cancel as untrusted (#5070), and its changeset promised **Review** there; the bar is where the
person presses Cancel run, so **Review** is its one way out, still with no Try again (C676-3).

## Covers

- first-run.run
