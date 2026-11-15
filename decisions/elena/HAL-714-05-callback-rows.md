# Decision: choosing Open step in the error list cancels the waiting sign-in first

- Task: HAL-714
- Approval: Liam approved the code in review task HAL-10402, and Sofia approved the wording and behaviour in UX review task HAL-10403 (re-check at `a40e42ec4`)
- Kind: user-visible

## What changes

The requirement `google-setup.google-error-list` gets one sentence: choosing an **Open step** button
in the folded error list first cancels the waiting sign-in, and opens the step even if the cancel
fails. It also gets an example for this.

## Why

Without the cancel, a person who leaves the error list for step 6 keeps a sign-in waiting in the
background. The new rows for how a sign-in ended (`google-setup.sign-in-ended`, new in this pull
request) would then show a stale note. No new wording: the buttons already exist.

## Tests

No test was weakened or skipped. A test was added for the cancel, and one for opening the step when
the cancel fails.

## Covers

- google-setup.google-error-list
