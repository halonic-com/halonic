# Decision: `halonic proposals reject` replaces `discard`, which keeps working

- Approval: Paperclip task HAL-16069 (the team's decision on C665, row 39 of HAL-16044: Studio's Reject and the CLI agree)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:k92/KAe3KHpwuCZCw0NqXIPB7qOswA93NWmtAsLYXQN6BbYf4QrE4mE7YHxUCCuUnSFAvaEw9UAjAPAcMbQ7Bg==

## What changes

`halonic proposals discard` becomes `halonic proposals reject`, so the CLI says what Studio's Inbox
says (**Reject**, **Reject all**, "Rejected 3 changes from run 01JD8Q"). Microcopy 1.2 settles
Accept · Reject for AI changes and lists Discard under "Not". The board's yes on HAL-9332 was for
the flow (list, show, accept, and a way to say no; nothing changes until you accept), not the verb,
so the word is a team call (HAL-2282).

- `cli.commands.proposals.decide`: the command is `reject`; it says "Rejected the changes to 2
  files." where it said "Discarded"; `discard` still runs it, and the requirement and the CLI's
  README name it once as the old name, so someone with an older script finds it (Sofia's call on
  HAL-16075). The example runs `reject`. For gone texts the fix reads "Reject it with halonic
  proposals reject 01jd8q to remove it.", so the verb you type and the verb in the sentence match.
- `cli.commands.proposals.show`: the last line says how to accept or reject.
- `inbox.proposal-page`: the command Studio offers shows how to accept or reject.
- `cli.subcommand-aliases` is new: a renamed subcommand keeps its old word, which runs it but isn't
  listed in the help, suggested or shown in a usage line.

Nothing is removed or weakened: every test still runs, `discard` gets a test of its own, and no
test file is deleted or skipped.

## Covers

- cli.commands.proposals.decide
- cli.commands.proposals.show
- inbox.proposal-page
