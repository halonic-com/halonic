# Decision: look before `reject` removes a run whose changes are gone

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16505 (a team decision with no board card, HAL-2282 rule: wording on the approved proposals commands; finding 6 of Iris's flow check C715 on HAL-16498)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/k3ViXjik7cYa7z7ug4lf7oK4A7yMImaPF58Nwsmpv2WhIYjkt+aNxQ6qz+BpFoPJXwJJyVzcKQE1+4t7nLPDA==

## What changes

When a run's changes were deleted outside Halonic, `halonic proposals show` and `accept` say to
remove the run from the list with `halonic proposals reject`. If the changes come back before the
person runs it (someone restores the folder), `reject` finds them and rejects them, as for any
proposal: the person asked to remove a list entry and instead rejected changes they never saw.
Studio's **Remove from Inbox** reads the proposal again in that case and shows the changes with
**Accept** and **Reject**.

The fix line now ends with the way to look first: "Remove run 01jd8q from the list with halonic
proposals reject 01jd8q. If its changes are back by then, that rejects them, so check first with
halonic proposals show 01jd8q." `reject` itself doesn't change: rejecting a proposal whose changes
are there is what the command is for, and the CLI has no state between two commands to tell a
"remove" apart from a "reject". The how-to says the same.

## Covers

- cli.commands.proposals.show
