# Decision: the Runs list names a web-request start

- Requirement: `runs.row-columns` (`packages/studio/features/runs/requirements/row-columns.md`)
- Task: HAL-195, PR 7b-1 (review and approval on HAL-8326)
- Approval: the Started by column is approved (HAL-7094); the words for a web-request start are the
  team's call on HAL-195 (HAL-2282), and Liam approved them in review on HAL-8326
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kmEKK0gHwcGZUxmWPXAfQosyefSeZMpaGhxl74qaOAl9xLkCj7ynKr2xHeHHIItrgD1f6yMSR7nl/hVmMHCZCA==

## What changes

The requirement gains one example: a run started by a signed web request (a
webhook trigger) reads "A web request arrived" in its Started by column, and a
screen reader hears "Started by a web request, 10:40.", in the words of the mail
and signal lines. Nothing existing is changed, loosened or removed. One test
was added.

## Why

A webhook trigger can now start a routine, so the list needs a name for it
instead of the "without a trigger" wording.

## Covers

- runs.row-columns
