# Decision: an agent's item shows who asks as the picture and its kind as a badge

- Requirements: `inbox.row-marks` (`packages/studio/features/inbox/requirements/row-marks.md`)
- Task: HAL-19666, from Sofia's proposal on HAL-19491, approved by the board on 26 Nov
- Approval: Liam approves this note in his review of this pull request on HAL-19666
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:iCWNhAfu2gSOPaeM79Q7mViaHn+V7CUTjoFGWjlFqZ/EbmS4JIAClSYRd9pjwIatobvXwH6KapHxtFrMV1d9Ag==

## What changes

The board approved Sofia's proposal on HAL-19491: the picture says who asks, a small badge says
what kind of item it is. Before, a question from a person, not an agent, started with a question
mark; the question mark now becomes the badge of the question kind, and the person shows as their
initials on the neutral tile. A sender the source doesn't name gets a silhouette.

- `inbox.row-marks`: an agent's card starts with the picture of who asks, with the card's kind as
  a badge (`inbox.picture-badge`): the agent's picture or initials, a person's initials, or a
  silhouette. The stamp, pause and gear of the Inbox's own items stay, with no badge.

New requirements, no change to existing ones besides the above: `kit.avatar-badge`,
`inbox.picture-badge`, `messenger.needs-you-badge`.

## Tests

Two existing tests change, neither weaker:

- `inbox-shared-look.test.tsx`, "starts a question from a person, not an agent, with a question
  mark": it checked the question mark's circle and no text. It now checks the person's initials
  ("AS" for "Acme support"), no agent tint, and a badge, which is the new rule.
- `project-filter.test.tsx`: `titles` read a row's whole cell text, which now starts with the
  person's initial on the picture. It now leaves out the `aria-hidden` decoration, so it still
  compares exactly the titles a reader gets.

New: `avatar-badge.test.tsx` (kit), `picture-badge.test.tsx` (Inbox) and
`needs-you-badge.test.tsx` (Messenger). The Messenger's `agent-pictures.test.tsx` passes unchanged
on the picture reader moved to the kit (`usePictures`).

## Covers

- inbox.row-marks
