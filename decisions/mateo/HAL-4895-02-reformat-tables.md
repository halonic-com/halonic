# Decision: write every Markdown table unpadded

- Task: HAL-4895 (part 2, halonic#1597)
- Approval: Liam approved the HAL-4895 plan and approves this note in review on [HAL-5293](/HAL/issues/HAL-5293)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DPeWWrFtuvA8aUBWAHwKozy6Y/qJ2lEgA4/gNXGqIF2bAHcS1iymVftMWjGhp80FAsOXW046KciODQDpRN9OAg==

## What changes

Every Markdown table in the repo is rewritten unpadded by `pnpm check:tables`, and the Part tables are sorted. The `markdown-tables` rule turns a padded table from a warning into an error. In the protected files below only table rows change: the cells, their order and the words around the tables stay the same.

## Why

A padded table rewrites every row when one cell grows, so two pull requests that each add a row conflict. Unpadded tables let them merge one after the other.

## Tests

No test, golden file or requirement text was weakened, skipped or deleted. The two requirement files keep every row and cell; only the spaces that padded the columns are gone.

## Covers

- events.timeline-entry-id
- std.secret-shape
- packages/testing/spec/
- tooling/check/
