# Decision: Check this computer's intro once the engine is ready, and the report's failure time

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15014
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:DhmF0lJqOpFCzJQtwt3gpL6tX1a9RCsv943IJkYMi7gL0G0H2TiqX3nto3Io5iV73UR08sYwFt4YflCqXPpNBw==

## What changes

The design check C525 (HAL-14999) of #4345 (HAL-14950) found two small places where Check this computer, approved by the board on 19 Nov (HAL-7993), says something that isn't true.

- **C525-1:** when the start turns ready while the dialog is open, the lines update, but the intro still said "Checks what this window can while the engine isn't running. …". Once the start is ready it now reads "Checks what this window can on its own. It changes nothing, and the report stays on this computer until you copy it." first-run-progress section 9 (revision 7, HAL-7986) lists it.
- **C525-2:** the shell keeps counting `seconds` after a failed start, so the report's "after *N* s" counted until the report was copied: a start that failed at 3 s read "after 18 s". The start watch now keeps the seconds of the first failed answer until **Try again**.

`shell.welcome-lite-check` says the intro in both states, writes down the ready "Not checked" line the code already had ("The engine's checks, which this window can't run"), and gains one example. `studio.start-watch` says a failed start keeps its first seconds until Try again, and gains one example. Each gains one test; no example is removed and no test is changed, dropped or skipped.

## Why

The intro and the report have to say what is true: an intro that says the engine isn't running while its own Engine line reads "Running" contradicts itself, and a report that dates the failure to the copy sends whoever reads it the wrong time. Both are details of the approved screen, so the team decided them under HAL-2282 (Noah, on HAL-15014), with no new card.

## Covers

- shell.welcome-lite-check
- studio.start-watch
