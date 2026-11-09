# events.sandbox-blocked

- Status: active
- Since: 0.1.0
- Source: stack 1b of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), approved by Liam on HAL-1967; the "named once with a count" log line of HAL-1708; task HAL-189

The run log shall have a `sandbox.blocked` event, with the step's `state`, its `agent`, the access the sandbox refused in `block`, and `count`, the running total of refused accesses to that target (or to `others`) in the step so far. A later event for the same target replaces an earlier count; it doesn't add to it. A `block` is a file (`path`, and `access`: `read` or `write`), a site (`host`, and `port` or `null`), or `others`: the blocked accesses to targets past the first 100 (`maxBlockedTargetsPerStep`) a step's log names. The events package shall make the logged copy of a file or site block with `sandboxBlockedView(block, home)`, which writes a path in the person's home folder with `~`, the way `sandbox.opened` does. Each event opens a timeline entry of its own. Older logs have no such event and read as before.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `sandbox.blocked` is among them, with `state`, `agent`, `block` and `count`, all required.
- Given the kinds of `block`,
  when they are listed,
  then they are exactly `file` (`path`, `access`), `network` (`host`, `port`) and `others`.
- Given a blocked read of `<home>/.ssh/id_ed25519` and the home folder `<home>`,
  when its view is made,
  then the path is `~/.ssh/id_ed25519` and the access is `read`.
- Given a blocked file outside the home folder, or an unknown home folder,
  when its view is made,
  then the path stays as it is.
- Given a blocked connection to `api.example.com` on port 443,
  when its view is made,
  then it is the same host and port, and no field is added.
- Given two `sandbox.blocked` events for the same target in one step, with `count` 1 and then 7,
  when the refused accesses to that target are counted,
  then they are 7, not 8.
- Given the limit of named targets per step,
  when it is read,
  then it is 100.
- Given two `sandbox.blocked` events for the same target in one step,
  when their timeline entries are worked out,
  then each is its own `seq`.
