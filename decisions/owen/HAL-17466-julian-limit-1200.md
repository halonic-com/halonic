# Decision: Julian's line limit goes from 800 to 1200 changed lines

- Approval: Liam decided it on HAL-17465 (24 Nov); Julian's scope is Liam's call under HAL-14809
- Kind: internal

`paperclip.reviewer-paths` names Julian for a pull request of up to 1200 changed lines
instead of 800. A pull request of 1201 lines or more, outside tests and Markdown, still
goes to Liam. Liam's paths, the sensitive words, security and release pull requests and
the run-permission rule don't change.

## Why

During phase 1 (HAL-17422) many pull requests between 800 and 1200 lines touch none of
Liam's paths and wait for Liam only because of their size.

## Covers

- paperclip.reviewer-paths
- tooling/paperclip/src/reviewer-paths.test.ts
