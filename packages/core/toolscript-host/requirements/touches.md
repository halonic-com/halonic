# toolscript-host.touches

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 3.2 (S14); task HAL-17570

When a header declares `touches` and its script calls a write capability, the toolscript-host package shall match each field the capability's `touches` entry names against the frozen copy of the arguments, with `{input.name}` and `{input.name[]}` filled from the run's input, and shall stop the run with `toolscript.undeclared-target` before `confirm` if a field doesn't match or the capability has no entry.

## Examples

- Given `touches` `{ "acme.set-note@1": { "name": "{input.names[]}" } }` and `names: ["a", "b"]`,
  when the script writes the note `b`,
  then the write is confirmed.
- Given the same header,
  when the script writes the note `c`,
  then the run stops with `toolscript.undeclared-target` and nothing is confirmed.
