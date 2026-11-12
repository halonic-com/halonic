# Decision: `ports.untrusted-tool-listings` points to `ports.listed-tool-approval`

- Requirement: `ports.untrusted-tool-listings` (`packages/core/ports/requirements/untrusted-tool-listings.md`)
- Task: HAL-2210, building the listed-tool approvals the board signed off on HAL-850 (2026-11-09)
- Approval: the board's sign-off on HAL-850; the package owner (Liam) approved the change in the review of #929 on HAL-3222
- Kind: internal

## What changes

One sentence of the "Cap the unfenced text" rule. It used to leave pinning a listing and
approving new tools to the host's design (HAL-520). It now says that
`ports.listed-tool-approval` covers them. Nothing the requirement promised is taken away, and no
example changes.

## Why

HAL-520 is now built as its own requirement, so the old sentence pointed at something that no
longer was open. #929 made the edit without this note. The requirement guard flagged that
while it only reports, and the note was added afterwards so the approved head didn't change.

No test was weakened or removed.

## Covers

- ports.untrusted-tool-listings
