# Decision: a run proposal says how to decide it where the window can't

- Task: HAL-15986
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15986 (a team decision with no board card, HAL-2282 rule: wording on the approved Inbox and proposal page; finding 2 of flow check C661 on HAL-15978)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:EJf3zgbBpqzEb/bxa5Shs4GdPp80SBT8wjo3rts7qp6z+gBQtsymfMnU6ZaRbMhJ7J5BCRXP8zFGhUl6LcZLBg==

## What changes

Flow check C661 found that a run proposal opened in the Inbox offered nothing to do, and that a
window without the agent host (a served Studio, a phone) listed no proposals and didn't say so.
**Accept** and **Reject** have since landed with #4932 in the desktop app, which lists proposals
through its agent host. Two places still left a person without a next step:

- A proposal opened where the window can't accept or reject now ends, while a file is undecided,
  with "Studio can't accept or reject these changes here. To see them and decide, run this in a
  terminal:" and `halonic proposals show 01JD8Q` in a box to copy. `show` prints the diffs and ends
  with the `accept` and `discard` commands, so one command is enough. The line follows the words
  of the approval card's "Studio can't run tools from Notes yet. To approve this one, run this in
  a terminal:".
- A window that lists no proposals says under Needs you, once it has loaded: "Changes your runs
  propose show only in the desktop app, or with `halonic proposals` in a terminal." It can't tell
  whether any are waiting, so it says where they show rather than that none are.

The run's id is the short one the row's title shows; the CLI takes it in either case.

## Covers

- inbox.proposal-page
- inbox.proposal-items
