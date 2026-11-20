# Decision: on a phone, an overview row's chips get a line of their own under the text

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13976
- Kind: user-visible

## What changes

On a phone, the shell's overview row (Workflows, Library, Agents and Routines) no longer puts its chips ("2 needs you", "1 running", "△ 2 warnings") in a column on the row's right. They go on a line of their own under the row's text, after the description and the used-by text (a workflow's Last run), and wrap onto a second line when they don't fit on one. The name, the description and the used-by text then keep the row's full width. A row without chips doesn't change, and the desktop doesn't change: at 1280 px the before and after screenshots are identical, pixel for pixel. No words change.

`shell.overview.row-parts-and-quiet-head` now says where the chips go on a phone and gains one example. `shell.overview.used-by` said the chips "stay on the right" on a phone; it now points to the chips' own line instead. No example is removed and no test is dropped or skipped.

## Why

The UX check C275 (HAL-13936, row NY1 on the a11y status sheet) found that on a phone the chip column took the text's width: at 195 × 421, the 400 % zoom of a 780 px window, Support reply's row showed only its avatar and "2 needs you", with the name 0 px wide; at 320 × 568 the text had 99 px and Last run was cut. That fails WCAG 1.4.10 (Reflow) at 320 px. The team decided on HAL-13930 (NT1, under HAL-2282: a detail of the approved Workflows list, no new words) that a phone row's chips go on a line of their own under the text, after Last run.

Measured with the real Workflows rows after the change: at 195 px every name box is 123 px wide (Support reply's was 8 px, Invoice intake's, with two chips, 0 px), at 320 px every Last run reads whole in a 248 px line, and nothing scrolls sideways at 195, 320 or 390 px (at 195 px it did before).

## Covers

- shell.overview.row-parts-and-quiet-head
- shell.overview.used-by
