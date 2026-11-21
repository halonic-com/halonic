# app.chat-tool-failure

- Status: active
- Since: unreleased
- Source: HAL-15052, decided by Liam on HAL-14935: the Try it chat says that a connector timed out (D12), the sentence a run page says for `tool-timeout`

When a model turn of a chat answer reports calls to connectors' tools that failed for a reason a run would name, the chat service shall tell its listener once for that turn, with those failures in order, each naming the call's id, the reason, the tool, the connector and how long the connector waited, and shall go on with the answer. A turn that reports none shall not tell the listener. Without its call id, a failure shall be the facts a run that failed the same way gives, so the chat can say the run's sentence for it.

## Examples

- Given a model turn whose connector `handbook-files` didn't answer the call `c1` to `search` within 60 seconds, followed by a turn that answers,
  when the chat answers,
  then the listener hears `{ toolCallId: "c1", reason: "tool-timeout", tool: "search", connector: "handbook-files", withinMs: 60000 }` once and the answer ends as answered.
- Given a model turn that reports no failed calls,
  when the chat answers,
  then the listener isn't told of any.
- Given a failure without its call id,
  when it is read as a run's failure,
  then it is the `tool-timeout` `RunFailure` that names the same tool, connector and time.
