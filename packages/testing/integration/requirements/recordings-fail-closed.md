# testing-integration.recordings-fail-closed

- Status: active
- Since: 0.1.0
- Source: HAL-135 (Ravi's input on HAL-99: an unknown request fails closed; the `halonic.recording/1` format agreed on HAL-149)

The replay transport shall answer from one `halonic.recording/1` file, in order: each request must match the next exchange on method and URL, and on body and key headers where the recording kept them, with a scrubbed placeholder matching any value. It shall throw for any other request, naming only its method, host, path and position.

## Examples

- Given a recorded JSON body whose user content was scrubbed,
  when the integration sends the real content, with its keys in another order,
  then the recording answers.
- Given a recorded key header `Bearer <scrubbed:secret>`,
  when the kit placed a key there,
  then the recording answers; when no key was placed, the transport throws.
- Given a request out of order or past the last exchange,
  when it is sent,
  then the transport throws a `NoRecordingError` without the query.
- Given a recorded event stream,
  when it is replayed,
  then the integration reads it as `text/event-stream`.
