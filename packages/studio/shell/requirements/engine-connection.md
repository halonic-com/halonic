# shell.engine-connection

- Status: active
- Since: 0.1.0
- Source: HAL-965 (E4), HAL-973

The shell shall follow the engine connection of the executor the app hands to `shell.engine.watch`, through the optional `connection` of the `RunExecutor` port, and count an executor without one as always connected. When the connection changes between `connected` and `lost`, the shell shall send `engine.connection { state }` once to every listener and announce the change once: the loss assertively, the return politely. When the executor reports the state it already has, the shell shall do nothing. If a listener throws, then the shell shall still call every other listener and throw the error afterwards. If the shell is asked to follow a second executor while it follows one, then the shell shall throw a `ShellError`.

## Examples

- Given the shell follows a remote executor that is connected,
  when the executor reports `lost` twice and then `connected`,
  then listeners get `lost` and `connected` once each, and the assertive region reads "Lost the connection to the engine." and the polite one "Connected to the engine again.".
- Given the executor is already `lost` when the shell starts following it,
  when the shell starts,
  then listeners get `lost` and the loss is announced.
- Given the local executor, which has no `connection`,
  when the shell follows it,
  then the state stays `connected` and nothing is sent.
