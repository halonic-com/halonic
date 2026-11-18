# Decision: no doubled words on a waiting run's page

- Task: HAL-11839
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11839 (wording decisions in the task, found in the UX re-check HAL-11832; small wording of an approved screen, team decision, HAL-2282 rule; Liam's code review of #3388)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:UCHRg3UEELaJb3WULIXRoIWCxBBr2wWKVX1KdAd1jiKSw43dVwSLGVsNnTdZIDfEDzCMI59MqekiQIHrszwfCg==

## What changes

- A run that waits for the user opens its summary line with "Waiting for you · started 12:25" instead of
  repeating the banner's sentence, and shows no "asked you once" until the run has ended. A finished run keeps
  "Finished in 5 s · asked you once".
- The line under the title and Details › Ran on read "The live version from 12:25." and "The saved files."
  instead of "Ran the live version …" / "Ran the saved files.", so the row no longer says "Ran" twice.
- The header's breadcrumb is the workflow's name ("Support reply") instead of "Run · Support reply"; the
  title already says "Run 01jd8q".

The requirements change their wording and examples to match, with a new example for a waiting and a finished
run. No test was weakened or skipped.

## Why

The UX re-check of HAL-11832 found the waiting run's page said the banner's sentence twice, showed a receipt
count on a run that had not finished, said "Ran" twice in Details and "Run" three times in the header.

## Covers

- runs.run-page
- runs.run-view.details
- runs.run-view.live-or-saved
- runs.run-view.receipt-summary
