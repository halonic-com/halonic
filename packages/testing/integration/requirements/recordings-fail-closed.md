# testing-integration.recordings-fail-closed

- Status: active
- Since: 0.1.0
- Source: HAL-135 (Ravi's input on HAL-99: an unknown request fails closed)

The replay transport shall answer only requests that match a recording on method, URL and canonical body, and shall throw for any other request, naming only its method, host and path.

## Examples

- Given a recording with a JSON body,
  when the same body arrives with its keys in another order,
  then the recording answers.
- Given a request no recording matches,
  when it is sent,
  then the transport throws a `NoRecordingError` without the query.
