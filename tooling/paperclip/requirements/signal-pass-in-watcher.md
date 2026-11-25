# paperclip.signal-pass-in-watcher

- Status: active
- Since: unreleased
- Source: HAL-18197 (plan HAL-17450 rev 5, "Step 2"; split from HAL-17980)

When a `pr-watch` pass has run the watcher's tick for a company, the plugin shall load the `pr-watcher` signal (the built-in one while the plugin reads no workspace snapshot), cut the rule's inputs from the same facts and memory the watcher decided each task on, work out the rule's actions, and hand them to the signal pass with executors that only log, keeping the pass's state in plugin state under a key of its own, so that it logs each done and wake action once next to the watcher's lines and writes nothing to Paperclip or GitHub, while today's watcher keeps doing the writes. A failure of the signal pass shall be logged and leave the watcher's own work alone.

## Examples

- Given the recorded pull requests of 22 Nov, one merged green and one red and conflicting, each on a task its author holds,
  when a `pr-watch` pass runs with the watcher's dry run off,
  then the signal pass logs exactly the done and wake actions the watcher writes, and the only writes to Paperclip are the watcher's, and every GitHub request is a read.
- Given a pass that logged its actions,
  when the next pass sees the same states,
  then it logs none of them again.
