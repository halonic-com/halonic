# format.tool-parameter-shapes

- Status: active
- Since: unreleased
- Source: HAL-18238 (follow-up from HAL-18194: `paperclip.next-step` reads `monitor` as an object and `blockedBy` as a list, and a required parameter declared as optional failed only at call time)

The format shall record, for each parameter in `TOOL_ACTIONS` that its action reads as more than a flat value, its shape as data (`toolActionInfo(name).parameters[i].shape`): an object with its fields, each with its name and whether it is required, or a list with the type of its items; `monitor` of `paperclip.next-step` is an object with `inMinutes` and `ref` required and `service` and `maxChecks` optional, and `blockedBy` of `paperclip.next-step` and `paperclip.finish-run` is a list of strings that its action also reads as one text with commas (`orText`), so a tool file may declare it as either. When a tool file passes its schema, the format shall still refuse it:

- with `parameter-optional` at `parameters.<name>.required` for each parameter its action requires that the file declares without `required: true`, with a message that names the action and the parameter and says to set `required: true`;
- with `parameter-type` at `parameters.<name>.type` for each parameter declared with another type than its action reads it as (an object, a list of the recorded item type, also a string when the list has `orText`, or a flat value), with a message that names the action, the parameter and the type it needs;
- for an object parameter, on its fields the same way as on parameters, at `parameters.<name>.fields`, naming each field as `<name>.<field>`: `parameter-missing`, `parameter-not-read`, `parameter-optional` and `parameter-type`;
- with `parameter-asks-for-key` for a field whose name says it holds a credential, and with `parameter-range-empty` for a field or list item whose `minimum` is more than its `maximum`.

## Examples

- Given a tool that runs `paperclip.next-step` and declares `monitor` as an object with `inMinutes` and `ref` required and `blockedBy` as a list of strings,
  when it is parsed,
  then it passes.
- Given a tool that runs `paperclip.next-step` and declares `blockedBy` as a string,
  when it is parsed,
  then it passes.
- Given a tool that runs `paperclip.next-step` and declares `task` without `required: true`,
  when it is parsed,
  then it fails with `parameter-optional` at `parameters.task.required`, naming `paperclip.next-step` and `task`.
- Given a tool that declares `monitor` as a string and `blockedBy` as a list of integers,
  when it is parsed,
  then it fails with `parameter-type` at `parameters.monitor.type` and `parameters.blockedBy.type`.
- Given a `monitor` object without `ref` and with a field `where`,
  when it is parsed,
  then it fails with `parameter-missing` naming `monitor.ref` and with `parameter-not-read` at `parameters.monitor.fields.where`.
