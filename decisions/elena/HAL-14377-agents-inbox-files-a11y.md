# Decision: Agents page, Inbox notice and file editor a11y details from C357, C361 and C367

- Approval: HAL-14377 (C357 on HAL-14363, C361 on HAL-14382, C367 on HAL-14404; each fix decided by the team on the task); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:R8z13rMfNjeJkvd3GIUzBROq5QJfmB24vDRwv2NdHlub8jDH4eNueDIrkI6CvlmsVqXsa/wPqKN049mi1syxCA==

## What changes

Three active requirements gain a line each. Nothing they already said is taken back.

- `files.ui.unreadable-strip` (FE1): when a file turns unreadable while its tab is open, the
  strip's words are said once, politely, through the window's announcer. They aren't said again
  while the file stays unreadable, and the Problems count isn't said. A file that is already
  unreadable when its tab opens isn't said, because it didn't just turn invalid.
- `inbox.notices-section` (ND1): each × also says "Notice dismissed." politely. Focus moves as
  before.
- `kit.status-chip` (DT1): in forced colours the dot takes `CanvasText`, as the sidebar's and
  Inbox's dots do. The requirement already said the dot is in the chip's text colour;
  `forced-color-adjust-none` kept it on its own colour, so the line now names `CanvasText`.

## Why

C357 found that typing a YAML file into an unreadable state showed the strip without saying it
(WCAG 4.1.3), and that dismissing the last notice said nothing, since focus lands on the Needs
you heading (WCAG 4.1.3). C361 found the chip's dot kept a purple or red colour in high contrast.
The team decided each fix on HAL-14377; this note records it for the guard.

## Tests

No test was weakened or skipped. `unreadable-strip.test.tsx` covers saying the strip once, not again on a
second bad line, and not on a file that opens unreadable. `notices-section.test.tsx` checks
"Notice dismissed." on each ×. `status-chip.test.tsx` checks the dot's `forced-colors:bg-[CanvasText]`.

## Covers

- files.ui.unreadable-strip
- inbox.notices-section
- kit.status-chip
