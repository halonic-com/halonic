# Decision: the Local only refusal says which way it changed

- Task: HAL-16373
- Approval: HAL-16373; Liam reviews this pull request and signs this note as the CTO
- Kind: user-visible

## What changes

When a save turned Local only on or off while a run is going, Studio refused the next start with
"Local only was turned on or off in Acme, so this run didn't start." It now says which way:
"Local only was turned on in Acme, so this run didn't start." or "Local only was turned off in
Acme, so this run didn't start." A routine's start refused for the same reason says it the same
way. The next steps ("Try again once the run that's going ends." and "It starts at its next time,
once no run is going.") stay as they were.

The requirement `studio.engine-service` is updated to say this: its sentence and its scenario for
Local only turned on take the new words, and a scenario for Local only turned off is added. The
test that checked the old sentence now checks the "turned on" one, and a new test checks the
"turned off" one. No test was weakened or skipped.

## Why

Finding 6 of flow check C700 (HAL-16369): "turned on or off" made the person work out what the
saved files now ask for. The engine knows which way it changed, since it was built with the other
setting. A team wording decision on an approved refusal (HAL-2282 rule).

## Covers

- studio.engine-service
