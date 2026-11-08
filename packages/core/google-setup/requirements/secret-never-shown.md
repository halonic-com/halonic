# google-setup.secret-never-shown

- Status: active
- Since: 0.1.0
- Source: HAL-698 (build plan D6)

The client secret store shall never put a client secret in a return value other than the two reads, in an error message or in a log line.

## Examples

- Given a store used to save, stage, promote, replace, discard and remove fake secrets, including two calls that fail,
  when every return value and error message is collected and the console is watched,
  then neither fake secret appears in them and nothing is logged.
- Given a saved secret,
  when `stageClientSecret` or `replaceClientSecret` is called with the ref and the value swapped,
  then the call throws a `RangeError` whose message doesn't hold the value, and the secret in use doesn't change.
