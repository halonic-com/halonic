# events.parse-event-line

- Status: active
- Since: 0.1.0
- Source: old app `parseEventLine` at commit 784f78d

When one line of a JSON-lines run log is parsed, the events package shall return the event in today's shape. If the line is not valid JSON, or is JSON but not an object, then it shall throw a `SyntaxError`.

## Examples

- Given the line `{"runId":"r","seq":1,"at":"…","type":"run.started","projectId":"p",…}`,
  when it is parsed,
  then the event has `hubId: "p"`.
- Given the line `{"runId":"r","seq":2,…,"type":"state.entered","state":"s"}`,
  when it is parsed,
  then the event equals the JSON object.
- Given the line `not json`,
  when it is parsed,
  then a `SyntaxError` is thrown.
- Given the line `null` (or `42`, `"run"`, `[]`),
  when it is parsed,
  then a `SyntaxError` is thrown.
