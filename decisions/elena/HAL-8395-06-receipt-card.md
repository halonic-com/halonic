# Decision: the run card shows the receipt instead of the line and the steps so far

- Task: HAL-8395 (T8 PR 6)
- Approval: Liam, in review of the pull request (his signature is added there)
- Kind: user-visible

## What changes

- `workflows.runs.runs-view`: the card docked beside the Runs view no longer shows the row's line
  and "Steps so far"; it shows the run's receipt at card width (new requirement
  `workflows.runs.card-receipt`), which has the summary line and what the run sent, read and cost.
  The requirement's text and one test expectation ("read → draft" became the receipt's "Finished in")
  change with it.

## Why

The simple card was always a stand-in "until T8's receipt replaces it" (UX 10.14, W-D3); the
receipt's summary line says what the line said, and Every step is the place for the steps. The
requirement for the card was a draft, and the change is the one it announced.

## Covers

- workflows.runs.runs-view
