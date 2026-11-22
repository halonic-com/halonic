# Decision: C629 words for a stopped plugin's message and the Dismiss toast

- Task: HAL-15792 (words check C629, HAL-15781)
- Approval: team wording on approved screens (HAL-2282); Sofia wrote the words in C629 and C633; Liam signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XWF7TlL6oqhXSlzoCHQJWzrIbAGyChNpecylXLpwumx07nCdLk3w3ps4P/uCAIU39AWPjFsYSINp9iaWYN0FCQ==

## What changes

A plugin the host stopped because its runner's sandbox didn't work (`plugin_stopped`, HAL-15537), C629 rows 21 to 26.
The card's and the command dialog's words for this stop landed on `main` first, from flow check C630 #4 (#4869,
HAL-15788), so this PR leaves them as they are and changes only the messages behind them:

- `agent-host-client.plugins`: the message for `plugin_stopped` is "Halonic stopped this plugin: the sandbox didn't
  work when it started, so none of it ran." It no longer promises a Try again the screen may not have.
- `agent-host.plugin-routes`: the host's own 403 message is "Halonic stopped this plugin: the sandbox didn't work
  when it started, so none of it ran. The next call tries the sandbox again." Studio doesn't show it, but Copy
  details and logs do. What the host does is unchanged.

The others:

- `first-run.setup-item` (row 27): the Dismiss toast's title is "First run dismissed.", with a full stop, because
  the toast has a second sentence (microcopy 1.3).
- `first-run.setup-item` and `first-run.one-state` (C633 row 35, HAL-15802): the toast's second sentence is "To bring
  it back, pick Help › First run › Show the guide again.", because #4733 renamed the Help item to **Show the guide
  again** (the board's C520-9) and the toast still named the old item. The requirements' other mentions of the item
  and the unreleased changeset `first-run-dismiss-help.md` follow.

The phone's pairing words (row 33) aren't in this PR either: #4854 (HAL-15754) named the computer's **Make a new
code** button there first.

C629 row 37 (the line after a partial Take back) isn't in this PR: Sofia OK'd the words for that line on HAL-15796
after C629, and they land with #4879 (HAL-15786).

No test was weakened or skipped.

## Covers

- agent-host-client.plugins
- agent-host.plugin-routes
- first-run.setup-item
- first-run.one-state
