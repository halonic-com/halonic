# Decision: halonic google reset says everything it removes, and when there's nothing

- Task: HAL-15122
- Approval: a team decision with no board card (HAL-2282 rule: wording on an approved command, from Iris's flow check C544-6 on HAL-15101); Maya confirms the wording on the task, and the reviewer approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:J2UN/pzSeasmyQOfbfCFBz3UAESdM2ehfonYUCYIxXKMw71jYjiFme+scXG6c11pRlt8UuLWIuwThyfyvzlLBQ==

## What changes

`cli.commands.google.reset` changes in three places. Its help and the line it gives without a
terminal now say "every integration's saved sign-ins", as the question already did, so someone who
runs it with `--yes` is told too. When neither the `google` folder nor `integration-sign-ins/tokens`
holds anything, it asks nothing, with or without `--yes` or a terminal, prints "Nothing to remove:
this computer has no Google accounts or saved sign-ins." and exits 0, where it used to print
"✓ Removed.". The ✓ line now names `halonic google secret` and `halonic google sign-in` next to the
Studio, with `<account>` as the other fix lines in this file do. The `google` group's summary covers
secret, sign-in and reset as well as switching sending for a connection. Maya confirmed the wording
on HAL-15129.

What it removes, what it leaves and its other exits stay the same. The fresh-profile example now
expects the "Nothing to remove" line, and one example is added for the line without a terminal.

## Why

Iris's flow check C544 (finding 6) found that the command said less than it removed outside the
terminal question, claimed to remove something on a fresh profile, and named only the Studio for
setting Google up again although the CLI can save the secret and sign in.

## Covers

- cli.commands.google.reset
