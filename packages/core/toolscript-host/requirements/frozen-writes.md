# toolscript-host.frozen-writes

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 3.2 (S9, S15, S16); task HAL-17570

When a script calls a write capability, the toolscript-host package shall deep-freeze the isolate's plain copy of the arguments, check that same frozen object against the capability's schema and `touches`, build the capability's preview from it, confirm the write with it (secret handles left as handles, which hold no value, and named by input in `secretInputs`), and send exactly it, with nothing from the script in between; and shall pass a capability's answer back only if it is plain data.

## Examples

- Given a write the person confirms,
  when it is sent,
  then the schema, the preview, `confirm` and the capability all get the very same frozen object.
- Given a capability whose schema refuses the arguments,
  when the script calls it,
  then the run stops with `toolscript.bad-argument` before `confirm` is asked.
- Given a capability that answers with a class instance,
  when the script calls it,
  then the run stops with `toolscript.capability-failed`.
