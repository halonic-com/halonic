# Decision: in a narrow window, an Inbox card's Open run and a plugin page's actions go under the title

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14006
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BvNKEnqZs270bU74wPmgHc2WvYOeEhnnOyFOIubdv5uJnBub40t53UFqr9mynMKbd3SOhedYzO5nGVUgDAFwDQ==

## What changes

An Inbox card's header (the approval card and the wait card) now wraps. Its title, with "Waiting since …" and "Started by …" under it, asks for 10rem (160 px) next to **Open run**; in a narrower card (a phone, or 400 % zoom) **Open run** goes on a line under that text, on the right, and the title has the whole width. This is the same rule the Inbox notices follow since HAL-13930.

A plugin page's header now wraps too. "Plugin" and the plugin's name ask for 9rem (144 px) next to the actions; in a narrower window the save note, **Open panel** and the ⋮ go together on a line under them, on the right, and the name has the whole width. At 9rem, not 10rem, the header of a 390 px phone stays on one line as it was. When **Open panel** and the ⋮ don't fit on one line together (at 195 px they need 166 px of 163), the ⋮ goes on a line under **Open panel**, inside the window.

At 390 and 1280 px nothing changes: measured on the wait card and the Weather plugin's page, every box, the headers' heights (76 and 52 px at 1280) and the buttons' places are the same as before. The Tab order doesn't change. No words change.

`inbox.approval-card`, `inbox.wait-card` and `plugins.plugin-page` say so and each gain one example. Nothing in them is removed or weakened, and no test is dropped or skipped.

## Why

The UX check C285 (HAL-13983, rows IT1 and PG1 on the a11y status sheet) found two older problems at 195 × 421, the 400 % zoom of a 780 px window, also on `main`. **Open run** sat on the title's line, so "Approve this reply?" got a 50 px column and broke inside its words ("Appr / ove / this / repl / y?"). And a plugin page's header showed "PLUGIN", **Open panel** and the ⋮ with the name "Weather" 0 px wide and the ⋮ cut past the window's right edge. At 320 px, the width WCAG 1.4.10 asks for, the plugin's name was cut to 38 px. The team decided on HAL-14006 (Noah as designer, under HAL-2282: a detail of approved screens, no new words) that on a phone the header's actions go on a line under the title, as NT1 did for notices.

After the change, at 195 px the card's title is 163 px wide and reads in three whole words, and the plugin's name is 59 px wide, whole, with every button inside the window. At 320 px the name is whole too.

## Covers

- inbox.approval-card
- inbox.wait-card
- plugins.plugin-page
