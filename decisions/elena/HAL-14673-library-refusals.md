# Decision: the Library's refusals list hears the page engine

- Task: HAL-14673
- Approval: the follow-up HAL-14673 of HAL-14672 asks for the page engine's refusals and waiting tools to reach the Library's refusals list, with a test; decided by the team on HAL-14673.
- Kind: user-visible

## What changes

- `studio.workspace-connector-status` gains two examples: a Try it chat turn that refused a call from `search` gives that refusal for `search`, and a run that left `mail`'s `lookup` tool waiting for an approval gives `lookup` as waiting for `mail`. No example is removed or changed, and no test is removed or weakened; three tests are added.

## Why

The requirement already promises "a list of what the engine refused" from the folder's connectors, but in the desktop app the Library read a fresh, empty list nothing wrote to. Each open folder now keeps one list that the Try it chats and the runs write to and the Library reads, and the two examples pin that. A run's refusals (as opposed to its waiting tools) and a background engine's still don't reach the list, and the README says so.

## Covers

- studio.workspace-connector-status
