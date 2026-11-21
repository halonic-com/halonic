# Decision: the first-run bar's place and the guide card's look follow sheet 05

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-8721 (the board approved the first-run sheets, sheet 05 shows the bar and the guide card); design check C520 on https://paperclip.halonic.com/HAL/issues/HAL-14970 (Sofia), task https://paperclip.halonic.com/HAL/issues/HAL-14976
- Kind: user-visible

Sofia's design check C520 compared the first-run bar and guide card on `main` with the board-approved sheet 05
and found four places where they differ. Matching the sheet is a detail of an approved screen, decided by the
team (HAL-2282), so the requirements change to say what the sheet draws:

- `shell.frame-strips` (C520-5): on the desktop the strips sit at the top of the page column, above the page and
  beside the full-height sidebar, instead of across the whole panel. Home, Inbox and Workflows no longer move down
  while the first run is on. The phone keeps them under the top bar. The desktop test now also checks that the
  strip is in the page's column and not above the sidebar.
- `workflows.page.guide-card` (C520-6 to C520-8): the card has its own border and corners, is as tall as its
  content, sits at the top beside the canvas, and has its title over a divider. A labelled line is a quote in an
  inset box with a bar at its start and the label small above the text, instead of a strong label inline. The
  button is full width with a ›, or with the refresh mark when the card's action runs something again (the new
  optional `again` on the action). The test no longer reads the label and the text as one inline sentence; new
  tests check the frame, the quote and both buttons.
- `first-run.guide-card` (C520-7): the email's label reads "The email", without the colon, as it does above the
  quote on the sheet, and **Run again** sets `again`. The test checks both.

No behaviour changes: the same card shows in the same cases, and its button does the same.

## Covers

- shell.frame-strips
- workflows.page.guide-card
- first-run.guide-card
- packages/studio/shell/src/frame/strips.test.tsx
- packages/studio/features/workflows/src/page/guide-card.test.tsx
- packages/studio/features/first-run/src/first-run-guide.test.ts
