# Decision: the button for a tool its server keeps changing is "Turn it on anyway"

- Approval: Paperclip task HAL-8868 (Mara's words check on HAL-2213, fix 6)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:s3rDyCDQ3S1OkkhZg9yn58AFAgz8tx46orWB3MbNwq/0so8vFWnM+cJkv3FRcLIuxYDiRCPj9jJYr037NTmtBg==

Two requirements named the button of a tool its server keeps changing **Approve this version**.
Mara's words check (HAL-2213) found that the name reads like the normal approval, when this tool
stays off until the person chooses to turn it on against Halonic's advice. The button now reads
**Turn it on anyway**, with the line "This server keeps changing *tool*. It stays off." above it.

Only the button's name changes in the two requirements. What it does is the same: it approves that
one tool, at the version shown, and Approve all never covers it. No example, test or behaviour is
removed or weakened; the tests that named the old button name the new one.

## Covers

- library.listed-tools-review
- library.listed-tools-review-states
