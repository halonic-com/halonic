# Decision: listing agents needs agents.read, and going live needs a plugin build

- Approval: HAL-18170 (the review minors from Liam and Julian on halonic#5932)
- Kind: internal

`runtime.paperclip-writes` gets two more rules.

1. An action lists the company's agents only when its handler declares `agents.read`,
   like the issue clients. The four actions that list agents now declare it:
   `paperclip.finish-run` (finds the assignee by name), `paperclip.task` (names the
   task's assignee), `paperclip.failed-runs` and `github.pull-request` (show an
   agent's display name). The `paperclip.task` and `paperclip.failed-runs`
   capability tests list it.
2. `mode` is a tool setting, so a newer pinned snapshot could turn a tool from dry run
   to write with no new plugin build. The runtime now treats that like a change of
   action: the tool is off until the plugin is rebuilt with `mode: write`. Going the
   other way, from write back to dry run, stays allowed.

## Why

Turning on writes should be a reviewed plugin build, not a change to a workspace file
that a pin picks up. Allowing the way back to dry run means a writing tool that
misbehaves can still be stopped quickly, with a pin and no rebuild.

## Covers

- runtime.paperclip-writes
