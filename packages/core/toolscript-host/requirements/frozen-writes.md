# toolscript-host.frozen-writes

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 3.2 (S9, S15, S16); task HAL-17570

When a script calls a write capability, the toolscript-host package shall deep-freeze the isolate's plain copy of the arguments, check it against the capability's schema, confirm the write with that frozen copy (secret handles shown by input name), and send exactly that copy, with nothing from the script in between; and shall pass a capability's answer back only if it is plain data.

## Examples

- Given a write the person confirms,
  when it is sent,
  then the capability gets an argument that is frozen and equal to the confirmed one.
- Given a capability whose schema refuses the arguments,
  when the script calls it,
  then the run stops with `toolscript.bad-argument` before `confirm` is asked.
- Given a capability that answers with a class instance,
  when the script calls it,
  then the run stops with `toolscript.capability-failed`.
