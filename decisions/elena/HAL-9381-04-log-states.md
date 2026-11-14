# Decision: the run page says what happens while its log is read, and when it can't be

- Task: HAL-9381, from Sofia's design check (B33)
- Approval: Liam, in review of HAL-9381 (his signature is added there)
- Kind: user-visible

## What changes

- `runs.run-page`: while the log is read the receipt holds a skeleton named "Loading the run"; when it can't be read the page says "Couldn't read this run's log" with the reason and Try again; when part of it is damaged a red banner names the line and says the receipt may be incomplete.

## Why

The words are Sofia's microcopy revision 99 (15.2, 15.3, 23.2), which the approved design check asked for. The change is team-decided small wording on an approved screen (HAL-2282). No behaviour is removed.

## Covers

- runs.run-page
