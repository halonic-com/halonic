# Decision: long help lines wrap at 80 columns

- Task: HAL-6938
- Approval: Sofia approved the layout on [HAL-6955](/HAL/issues/HAL-6955) and wrote it into cli-output 1.9, revision 51 ("How a long help line wraps"), a detail of an approved screen, so it's a team decision with no board card (HAL-2282 rule); Julian reviewed it on [HAL-6996](/HAL/issues/HAL-6996), Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wT4uGNU8C58gHOEDb79yoqI3NmTquzrzQQAsuFrCUUOtgWLKARxgLTCE2m+m80Pt3Ay4eRmlypicEfFP69NGAg==

## What changes

`cli.help`: "every help line shall fit 80 columns" now also says how a longer line wraps. A
usage line breaks between arguments, never inside `[…]` or `<…>`, and goes on under its first
argument. A command summary or option description breaks between words and goes on under its
own column. Help wraps at 80 columns whatever the terminal's width, colour codes don't count,
and an argument or word longer than the room goes on its own line, never cut. The words stay
the same. A new example covers a usage line and a description that are each too long. No
example was removed or weakened.

## Why

`halonic run --help` and `halonic trust --help` printed lines past 80 columns, which broke the
requirement's own rule. Sofia's layout keeps each argument whole, so a wrapped usage line
still reads as one command.

## Covers

- cli.help
