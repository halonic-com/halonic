# runtime.worker-protocol

- Status: active
- Since: unreleased
- Source: HAL-18001; Liam's decision W1 on HAL-18000 (our own worker protocol client, with its conditions)

The plugin worker shall speak Paperclip's plugin worker protocol (JSON-RPC 2.0, one message per line) with its own client, built from built-in web APIs only, so that the `worker.js` it is built into holds no Paperclip code and imports no module but the `snapshot.json` next to it; when Paperclip initializes it with a plugin API version other than the one of the SDK version the client names, the worker shall refuse with an error that names both versions; it shall call back to Paperclip for state, secrets, http, agents and metrics only when the plugin's manifest declares the capability that call needs, and refuse the call itself otherwise; it shall never put a secret value into an error; it shall answer a line that is too long, isn't JSON or isn't a JSON-RPC message, and a request for a method it doesn't have, with a JSON-RPC error and keep running; and it shall give up on a call back to Paperclip that gets no answer in time.

## Examples

- Given a worker initialized with the capabilities `plugin.state.read` and `plugin.state.write`,
  when a tool sets and reads a state key,
  then Paperclip's state holds the value and the tool reads it back.
- Given a worker whose manifest doesn't declare `secrets.read-ref`,
  when a tool asks for a secret,
  then the worker sends Paperclip nothing and the tool gets a refusal that names `secrets.read-ref`.
- Given Paperclip sends `initialize` with `apiVersion: 2`,
  when the worker answers,
  then the answer is an error naming version 2, version 1 and the SDK version, and no tool is registered.
- Given Paperclip sends `{not json`,
  when the worker reads it,
  then it answers with a parse error and still answers `health` afterwards.
- Given Paperclip never answers `state.get`,
  when the worker's timeout passes,
  then the tool gets an error that names `state.get`.
