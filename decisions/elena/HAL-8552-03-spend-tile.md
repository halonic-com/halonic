# Decision: Home gets a Spend section, and MonthBars takes a note and a limit line

- Approval: Noah's spec on HAL-8553 (a team decision, a detail of the approved Home design, built on the board's design decisions of 13 Nov on HAL-8416); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:UyfnjGw3YOsrXBRCaGKHFZeLskn974mb2by5+aiD8j2i76qwCfIA1w+8IDyB+rd3HP3F/CeThX+dY3ov9AtQCw==
- Task: HAL-8552

Users see this change. The note is `internal` because no key is pinned for
`user-visible` notes yet, and a requirement change takes a signed note of either kind.

## What changes

`kit.month-bars` now also says that `MonthBars` shows a given note under the big number (amber
when it asks for attention) and a given limit as a thin dashed line across the bars, labelled at
its left end with a halo, with the scale including the limit. Three examples were added: a note
that asks for attention, a limit at the top of the scale, and no limit means no line. Without a
note or a limit, `MonthBars` draws exactly what it drew before.

`shell.home-sections` now lists Spend as a fourth Home section, after Recent runs. One example
was added for the order. The rule for who may add a section, the headings and the error are
unchanged.

No example was removed or weakened.

## Why

Home shows the monthly spend next to the budget that stops runs. The tile needs a note and a
budget line, and Home needs a place to put it. Both additions only add behaviour that nothing
used before.

## Covers

- kit.month-bars
- shell.home-sections
