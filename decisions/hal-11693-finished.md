# Decision: a completed run reads "Finished", not "Finished in Done"

- Task: HAL-11693
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11699 (Sofia's wording decision; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:HtlKGxAj6ZKN/7a+mhaeHR0Ul+1Rg8f20/Oikj56A8SMV6Q+PvusmyReXf2g/Guw5HsVqChnIzntYOWZsXz0CA==

## What changes

Home's Recent runs, the Runs list and `halonic runs list` said "Finished in Done" for a run that
ended in its final state `done`, which reads as if "Done" were a step. They now say "Finished".
The run page's receipt ("Finished in 2 min") is unchanged.

The requirement `runs.row-columns` changes its wording and its tests. No test was weakened or skipped.

## Why

Sofia chose "Finished" alone over naming the run's last step (HAL-11699). A completed run always
ends in a final state, so the state adds nothing.

## Covers

- runs.row-columns
