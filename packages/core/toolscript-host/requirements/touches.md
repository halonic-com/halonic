# toolscript-host.touches

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 3.2 (S14); task HAL-17570

When a script calls a write capability, in a user run or under a header that declares `touches`, the toolscript-host package shall match each field the capability's `touches` entry names against the frozen copy of the arguments, with `{input.name}` and `{input.name[]}` filled from the run's input, and shall stop the run with `toolscript.undeclared-target` before `confirm` if a field doesn't match or the capability has no entry. A user header without `touches` counts as `touches: {}`, so it allows no write.

## Examples

- Given `touches` `{ "acme.set-note@1": { "name": "{input.names[]}" } }` and `names: ["a", "b"]`,
  when the script writes the note `b`,
  then the write is confirmed.
- Given the same header,
  when the script writes the note `c`,
  then the run stops with `toolscript.undeclared-target` and nothing is confirmed.
- Given a user header with no `touches`,
  when the script calls any write,
  then the run stops with `toolscript.undeclared-target` and nothing is confirmed.
