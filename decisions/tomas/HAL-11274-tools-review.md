# Decision: add the golden files of `halonic tools review`

- Task: HAL-11274
- Approval: Liam reviewed and approved this change on HAL-11274 (a team decision with no board card, HAL-2282 rule). He signs this note.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LCYgw+lxHGJK3PZu7PW+C3+dtshRcq7TA4q7pmmBH49GWfLNJsFEXLqMqrKE5ZOCqlOgxmlRjpoVMJveyYoKCw==

## What changes

The new command `halonic tools review` adds two golden files: one for the review of a source
with every kind of tool (changed, new, refused, keeps changing), and one for a tool whose text
is the same under two names. Both show the command's output as the requirement
`cli.commands.tools.review` describes it.

## Why

They are new files for a new command, so no earlier output changes and no test is weakened or
skipped. The guard asks for a note for every added golden file.

## Covers

- apps/cli/src/commands/tools/golden/review.txt
- apps/cli/src/commands/tools/golden/review-same-text.txt
