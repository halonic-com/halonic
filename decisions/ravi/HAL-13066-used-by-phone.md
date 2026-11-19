# Decision: on a phone, the description is cut and the used-by text stays whole

- Task: HAL-13066
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13066 (Sofia's team decision on the approved Library screen, HAL-2282 rule, no new words; Liam approves this note in review on the task)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hzUkCpPplt9Cntvd7jZC1sFkpbVCiKs1GiPekz8n9s39YxIDTOk68sZ97kw9zPBsxa8X06J7EHjgksRB0fmKDg==

## What changes

HAL-12858 put a row's used-by text at the end of the line under its name on a phone, after the
description and " · ". The line was cut at its end, so with any ordinary description the used-by text
was the part that went: "When an email asks for a refund · Not …" at 390 px, and nothing of it at
320 px.

The requirement `shell.overview.used-by` now also says that when that line is too long, the page
cuts the description with an ellipsis and keeps the " · " and the used-by text whole: "When an email
asks for … · Not used yet". With no description the line is the used-by text alone, as before.
Desktop rows don't change. The overview page is shared, so Agents and Workflows phone rows get the
same rule.

Nothing is removed or weakened: the examples stay, and the two phone examples now also say which part
can be cut, with a test.

## Why

The used-by text is the status people look for on the row; the description is already in full on the
item's page. It is the same rule as HAL-12829, where a Runs row's short id and time stay whole and
only Started by is cut. A screen reader already heard the whole line and still does.

## Covers

- shell.overview.used-by
