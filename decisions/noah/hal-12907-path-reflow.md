# Decision: a Recent row's folder end and name wrap instead of running out of the row

- Task: HAL-12907
- Approval: team decision under the HAL-2282 rule for a layout detail on an approved screen (Sofia and Noah); Liam reviews the pull request on HAL-12907 and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kKTdfdO2Xse1vumNokeQJMFzRNd/2j+BmyZf3NCXqWRtMPDbdx9ejW0yYLvE9xC8jp7sLPzkLBrENbEnUBt7BA==

## What changes

A folder's end that is wider than its row, as at 400% zoom, now wraps onto more lines inside the row, between folder names first, instead of drawing past the row's edge and through its focus ring. The start keeps room for its "…". This is the shared `MiddleCut`, so the sidebar's workspace switcher gets it too.

A Recent row's name now wraps and shows in full, instead of ending in "…" with no other place to read it.

The `shell.welcome-recent` requirement gains those two clauses and one example. No test was weakened or skipped; the switcher's test now finds the end by its new `whitespace-pre-wrap` class.

## Why

Sofia's keyboard and screen-reader check (HAL-12896, rows R1 and R2) found a long last folder name running 19px past its row at 320 CSS px (WCAG 1.4.10 Reflow), and a long workspace name that a sighted user could never read in full.

## Covers

- shell.welcome-recent
