# Decision: on a phone, an overview row's chips get a line of their own under the text

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13976
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:aisvabLE0QVIzSiqBvWyycp+T2KhulTRDLSnqc+c7SuUJkZ/yAPOIDO7mzJpn5l+3hyqltxEJCM1g4ih/sC1BA==

## What changes

On a phone, the shell's overview row (Workflows, Library, Agents and Routines) no longer puts its chips ("2 needs you", "1 running", "△ 2 warnings") in a column on the row's right. They go on a line of their own under the row's text, after the description and the used-by text (a workflow's Last run), and wrap onto a second line when they don't fit on one. The name, the description and the used-by text then keep the row's full width. A row without chips doesn't change, and the desktop doesn't change: at 1280 px the before and after screenshots are identical, pixel for pixel. No words change.

`shell.overview.row-parts-and-quiet-head` now says where the chips go on a phone and gains one example. `shell.overview.used-by` said the chips "stay on the right" on a phone; it now points to the chips' own line instead. No example is removed and no test is dropped or skipped.

## Why

The UX check C275 (HAL-13936, row NY1 on the a11y status sheet) found that on a phone the chip column took the text's width: at 195 × 421, the 400 % zoom of a 780 px window, Support reply's row showed only its avatar and "2 needs you", with the name 0 px wide; at 320 × 568 the text had 99 px and Last run was cut. That fails WCAG 1.4.10 (Reflow) at 320 px. The team decided on HAL-13930 (NT1, under HAL-2282: a detail of the approved Workflows list, no new words) that a phone row's chips go on a line of their own under the text, after Last run.

Measured with the real Workflows rows after the change: at 195 px every name box is 123 px wide (Support reply's was 8 px, Invoice intake's, with two chips, 0 px), at 320 px every Last run reads whole in a 248 px line, and nothing scrolls sideways at 195, 320 or 390 px (at 195 px it did before).

## A chip wider than its column wraps inside its edge

The re-check C285 (HAL-14005, row NY2) found that at 195 px the chip itself could still be cut: with Arial's widths "2 needs you" is 89 px on its own line, in a 75 px text column, so it read "2 needs yo" with its right edge gone. The team decided on HAL-14005 (under HAL-2282: a detail of NY1's decided fix, no new words) that a chip wider than its column wraps its words inside its edge, never cut.

The kit's `StatusChip` now keeps its words on one line, as before, but is never wider than the column it sits in; when it would be, it wraps its words inside its edge. That holds in a line that cuts its own text too, such as a list row's line under the name. `kit.status-chip` says so and gains one example; no example is removed and no test is dropped or skipped. Where a chip fits, nothing changes: at 320 and 1280 px every chip has the same size as before. At 195 px "2 needs you", "△ 2 warnings" and "✕ 2 problems" are 91 px wide on two lines, whole, in a 91 px column, and nothing scrolls sideways.

To stay under the 500-line limit, the overview page's phone tests moved to their own file, `overview-page-phone.test.tsx`, unchanged.

## A phone row's short detail reads straight on

While rebasing, Ravi found (HAL-14630) that on `main` a phone row's "detail · used-by" line (Library and Agents rows) read " · Not used yet" at 320 and 390 px: the detail was stretched to its box's 0 px height, and its `truncate` clipped all its text. HAL-14127 (#4152) has since fixed that on `main` (`h-lh`). With the detail shown, a short one shows a second slip: "Tone of voice" reads "Friendly ·" with a wide gap before "Used by Writer", because the detail's box grows to fill the line. HAL-14996 (#4401) has since fixed that on `main` too: the box's 5rem is its basis rather than its minimum, and `max-w-fit` caps a short detail at its own width, so it reads "Friendly · Used by Writer". This pull request keeps `main`'s fix and changes no class on that line; the phone unit test checks `main`'s classes. It adds the tests: the 390 px browser test now also checks that the detail is painted (a box that is drawn and hit at its middle, not only a box inside the line), and a new 390 px test checks that "Friendly", its " · " and the used-by text sit together. `shell.overview.used-by` already describes the line as "detail · used-by", so no words change. The team decided on HAL-14630 (under HAL-2282: a detail of the approved row, no new words) that these tests land here.

## Covers

- shell.overview.row-parts-and-quiet-head
- shell.overview.used-by
- kit.status-chip
- packages/studio/shell/src/overview/overview-page.test.tsx
