# Decision: the never-taken line uses the attention tone and is read with its row

- Approval: HAL-15540, from my visual check C592 (HAL-15532, findings 1 to 3) on the board-approved docked step card (flow-workflows 5.3); a small change on an approved screen, decided by the team and written on the task (HAL-2282); the reviewer approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cbGukvaBTbUAKx3GA0X2zCsbxyn2PUQnmObzzyYEui+kqLp0wbpPZnbI6XIEvN1dnVRrx5XaeoSqQ9DnGSjGDA==

The requirement workflows.page.step-arrows gains two things; nothing is removed or weakened:

- The line "△ Never taken: arrow <m> always matches first" now shows in the attention tone (amber), the tone the canvas gives the same `unguarded-shadow` check. It used the warning tone (violet), which in Studio means "Needs you".
- The row's button is described by that line (`aria-describedby`), so someone moving through the rows with the keyboard hears that the arrow is never taken, not only "To Draft a reply on done". The △ stays hidden from screen readers.

One example gains "which its button is described by", and a new test checks it. The wording of the line itself doesn't change. No test runs fewer times or checks less.

## Why

The line sat outside the row's button, so it was not read with the row, and its violet said "Needs you" for what is a check's warning. The canvas already shows this check in amber.

## Covers

- workflows.page.step-arrows
