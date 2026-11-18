# Decision: don't report the test of a workflow whose own file failed

- Approval: the task HAL-12126 asks for this change, from the new-user flow check on HAL-12121; Liam decided it as maintainer and wrote it, so Julian signs.
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:8pbMfjkj5Ly3n8TxTiyB9mxJ3tN34mID6j58P8qQJFOI3g0K36QQzY7Xac1kVD3kLNc8Zq7V94HTLC9b86ODCA==

## What changes

When a workflow file fails its own checks, the workflow test next to it no longer gets `Test targets unknown workflow "<id>"`. The test is skipped only when a workflow file of its hub, named after the workflow the test targets, was read and failed. A test of a workflow that no file names still gets the error.

`workspace.references` says so, and `packages/testing/parity/allowed-differences.json` gains the entry `test-of-failed-workflow-not-reported`, which lists the 11 parity cases where the old loader gave that error. The entry is marked `signed-off`: this note's signature is the review of its exact text.

## Why

The second error only repeats that the workflow file failed. In the new-user flow check it was listed first, before the workflow file, and hid the real cause, a misspelled `name:`. It follows the existing rule for a failed `hub.yaml`, whose agents aren't checked either.

## Tests

No test was weakened or skipped. `references.test.ts` gains a test for two of the cases. The list of entries' requirements in `allowed-differences.test.ts` gains the new entry's requirement. The workspace parity test passes with the entry.

## Covers

- workspace.references
- packages/testing/parity/allowed-differences.json
