# Decision: setup step rows wrap their title and hint, and the hint describes the row

- Task: HAL-13121
- Approval: decided by the team on HAL-13121 (https://paperclip.halonic.com/HAL/issues/HAL-13121), a detail of the approved Get set up and Try the sample screens; Liam signs on the same task. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Sb+tCLkJ9aKEu+5M5EtUHAfukc4/7yzs4bPdxCXwMMOrXMixNe0xi7btIOAIEyFr8tzs6jYGvUG4ZmQgYR7BAQ==

## What changes

On a phone, a setup step's row cut its title and its hint with "…": at 320px "Approve or reject
the re…" and "The run waits for you befo…", with no other way to read them (WCAG 1.4.10 Reflow).
A screen reader never heard the hint, as the row was named only by its label.

Now a `SetupSteps` row wraps its title and hint at any width and grows with them. Its circle
stays at the top, beside the title, and the chevron stays at the right edge, centred on the row.
The row keeps its 56px minimum. The hint is the row's description (`aria-describedby`), so a
screen reader hears "Step 2 of 3: Approve or reject the reply, not done. The run waits for you
before it finishes." No new words.

The List gets two row options for this, `wrap` and `metaDescribes`; rows without them don't
change. The requirement `kit.setup-steps` says so and gains an example, and `kit.list` gains a
sentence for the two options. The new test "wraps a step's title and hint on a 320px phone and
reads the hint as the row's description" fails before the fix. No test was weakened or skipped.

## Why

Found in the C137 check (HAL-13108) of #3732. Get set up (L6) and the sample card both use
`SetupSteps`, so both get the fix.

## Covers

- kit.setup-steps
- kit.list
