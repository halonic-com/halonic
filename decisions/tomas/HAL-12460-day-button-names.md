# Decision: a toggle chip can carry a full name for screen readers

- Task: HAL-12460
- Approval: Liam approves this change on HAL-12460 (https://paperclip.halonic.com/HAL/issues/HAL-12460), from the keyboard and screen-reader check on HAL-12426 (row A10). A team decision with no board card (HAL-2282 rule); the day names are in microcopy 19.8, revision 115.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wYxGh9lFyhM8B0inJanYDcHOqQ61uUzOapmadmLi+One3X83NMFxi7VkaCPiVEZ0bn0KLEwazanGZUaNrvAtCQ==

## What changes

A `FilterChips` toggle gets an optional `name`. When it is set, it is the chip's name for screen
readers and the chip still shows its label. A routine's day chips use it: they show "Mo" to "Su"
and are named Monday to Sunday.

The requirement `kit.filter-chips` gains one sentence and one example for the name. Nothing in it
is removed or weakened, and no test is.

## Why

A screen reader read the day chips as the words "Mo", "Sa" and "Su", so a person couldn't tell
which day each one was. Each full name starts with the chip's two letters, so the visible words
stay in the name (WCAG 2.5.3).

## Covers

- kit.filter-chips
