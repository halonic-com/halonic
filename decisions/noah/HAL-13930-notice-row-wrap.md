# Decision: a narrow Inbox notice puts Open run and × on a line under its text

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13930
- Kind: user-visible

## What changes

A notice row in the Inbox's Notices list now wraps. Its text asks for 10rem (160 px) next to its buttons; in a narrower row (a phone, or 400 % zoom) **Open run** and the ×, or "Fixed" and the ×, or **Change budget**, go together on a line under the text, on the right, with the × last. The text then has the whole width. At 390 px and wider nothing changes: measured on a budget-stop, a fixed and a monthly budget notice, every text box is the same width as before at 390 and 1280 px. The Tab order stays text link → **Open run** → ×. No words change.

The `inbox.notices-section` requirement says so and gains one example. Nothing in it is removed or weakened, and no test is dropped or skipped.

## Why

The UX check C271 (HAL-13921, row NT1 on the a11y status sheet) found that at 195 × 421, the 400 % zoom of a 780 px window, a budget-stop notice's text got a box 0 px wide: every word stood on its own line and **Open run** was drawn over "Reached €5.00". That's past WCAG 1.4.10's 320 px, but it's the zoom we test, and overlapping text can't be read. At 320 px the text was 107 px wide and read in short lines. The team decided on HAL-13930 (Noah as designer, under HAL-2282: a detail of the approved Inbox notice, no new words) that the buttons go on a line under the text when the row is too narrow. After the change the text is 147 px wide at 195 px and 272 px at 320 px, with nothing overlapping and no sideways scroll.

## Covers

- inbox.notices-section
