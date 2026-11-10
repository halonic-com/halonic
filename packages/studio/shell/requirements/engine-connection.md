# shell.engine-connection

- Status: active
- Since: 0.1.0
- Source: HAL-965 (E4), HAL-973; microcopy 2 and 19.2 (HAL-751); UX checklist part 1, 1.5 (HAL-1323)

The shell shall follow the engine connection of the executor the app hands to `shell.engine.watch`, through the optional `connection` of the `RunExecutor` port, and count an executor without one as always connected. When the connection changes between `connected` and `lost`, the shell shall send `engine.connection { state }` once to every listener. While the engine isn't answering after it had answered, the shell shall count it as stale. When it becomes stale, the shell shall announce "The engine isn't answering. Showing what it said last." assertively, and when it answers again, "The engine is answering again." politely, once each for the window; an engine that never answered shall not be announced. The words shall follow where the Studio runs: "Halonic on the server …" when served and "Halonic on your computer …" on a phone, both answering again as "Halonic is answering again."; the reason for a page that couldn't load shall be "The engine isn't answering. It may still be starting.", "Halonic on the server isn't answering." or "Halonic on your computer isn't answering.". When the executor reports the state it already has, the shell shall do nothing. If a listener throws, then the shell shall still call every other listener and throw the error afterwards. If the shell is asked to follow a second executor while it follows one, then the shell shall throw a `ShellError`.

## Examples

- Given the shell follows a remote executor that is connected,
  when the executor reports `lost` twice and then `connected`,
  then listeners get `lost` and `connected` once each, and the assertive region reads "The engine isn't answering. Showing what it said last." and the polite one "The engine is answering again.".
- Given the executor is already `lost` when the shell starts following it,
  when the shell starts,
  then listeners get `lost`, the engine isn't stale and nothing is announced: the page says it couldn't load.
- Given a served Studio whose engine was answering,
  when the connection is lost and comes back,
  then the regions read "Halonic on the server isn't answering. Showing what it said last." and "Halonic is answering again.".
- Given the local executor, which has no `connection`,
  when the shell follows it,
  then the state stays `connected` and nothing is sent.
