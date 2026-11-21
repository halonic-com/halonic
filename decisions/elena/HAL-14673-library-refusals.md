# Decision: the Library's refusals list hears the page engine

- Task: HAL-14673
- Approval: the follow-up HAL-14673 of HAL-14672 asks for the page engine's refusals and waiting tools to reach the Library's refusals list, with a test; decided by the team on HAL-14673.
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:hYMVjIFWg+xNePIGZnFvVcjV0/wz2TXtOzZ9nw1DZHCrTDONPpjJskES6nPQlMtkWxGpSw9RrpVOrWPgxDrgDQ==

## What changes

- `studio.workspace-connector-status` gains three examples: a Try it chat turn that refused a call from `search` gives that refusal for `search`; a run that left `mail`'s `lookup` tool waiting for an approval gives `lookup` as waiting for `mail`; and once a person approves that `lookup` in the Library, the status no longer gives it as waiting. No example is removed or changed, and no test is removed or weakened; five tests are added.

## Why

The requirement already promises "a list of what the engine refused" from the folder's connectors, but in the desktop app the Library read a fresh, empty list nothing wrote to. Each open folder now keeps one list that the Try it chats and the runs write to and the Library reads, and the examples pin that. A run reports only what waits, never that a tool stopped waiting, so the Library's approval takes the approved tools off the list; without that, an approved tool would keep showing as waiting until the folder is opened again. A run's refusals (as opposed to its waiting tools) and a background engine's still don't reach the list, and the README says so.

## Covers

- studio.workspace-connector-status
